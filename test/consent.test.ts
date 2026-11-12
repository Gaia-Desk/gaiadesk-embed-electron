// The consent step over a FAKE binding: what reaches the addon, what the app
// gets back, the bridge, and start with a decision.
import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';

import { EmbedError, configJson, consent, consentBridge, createConsentBridge, parseEvent, preview, recordConsent, useBinding } from '../dist/index';
import type { Choices, ConsentReceipt, NativeBinding, RecordConsentInput } from '../dist/index';

const TOKEN = 'gdemb_' + 'c'.repeat(64);
const choices: Choices = { guided: false, share_logs: true, capture: 'screen' };
const input: RecordConsentInput = {
  decision: 'declined',
  choices,
  wording: { title: 'Share with Acme?' },
  wording_version: 'v1',
  locale: 'en',
  company: 'Acme',
  capture: 'screen',
  app_version: null,
};

function fake(over: Partial<NativeBinding> = {}): { calls: [string, unknown][] } {
  const calls: [string, unknown][] = [];
  const unused = (): never => {
    throw new Error('not in this test');
  };
  useBinding({
    buildInfo: () => '{}',
    showConsent: unused,
    NativeEmbed: { start: unused },
    consent: (json, onEvent) => {
      calls.push(['consent', JSON.parse(json)]);
      onEvent?.('{"type":"consent_shown","locale":"en","wording_version":"v1"}');
      onEvent?.('{"type":"state","state":"waiting"}');
      onEvent?.('{"type":"consent_accepted","choices":{"guided":true,"share_logs":false,"capture":"window"}}');
      return '{"decision":"accepted","choices":{"guided":true,"share_logs":false,"capture":"window"},"consent_token":"gdc_1"}';
    },
    preview: (json) => (calls.push(['preview', JSON.parse(json)]), '{"png_base64":"iVBO","width":480,"height":300,"masked_count":2}'),
    recordConsentEx: (json) => (calls.push(['record', JSON.parse(json)]), '{"decision":"declined","choices":{"guided":false,"share_logs":true,"capture":"screen"}}'),
    ...over,
  });
  return { calls };
}

afterEach(() => useBinding(null));

test('consent: the options as given, the consent events only, the decision parsed', () => {
  const { calls } = fake();
  const events: string[] = [];
  const d = consent({ company: 'Acme', guided: true, theme: { accent: '#5b4cf0' } }, (e) => events.push(e.type));
  assert.deepEqual(calls, [['consent', { company: 'Acme', guided: true, theme: { accent: '#5b4cf0' } }]]);
  assert.deepEqual(events, ['consent_shown', 'consent_accepted']);
  assert.equal(d.consent_token, 'gdc_1');
});

test('refusals are EmbedErrors with the library code; an older binary is unsupported', () => {
  fake({
    consent: () => {
      throw new Error('wrong_thread: the consent dialog must run on the main thread');
    },
    preview: () => {
      throw new Error('capture_unavailable: no Screen Recording permission');
    },
  });
  assert.throws(() => consent(), (e: unknown) => e instanceof EmbedError && e.code === 'wrong_thread');
  assert.throws(() => preview(), (e: unknown) => e instanceof EmbedError && e.code === 'capture_unavailable');
  fake({ consent: undefined, preview: undefined, recordConsentEx: undefined });
  for (const f of [() => consent(), () => preview(), () => recordConsent(input)]) {
    assert.throws(f, (e: unknown) => e instanceof EmbedError && e.code === 'unsupported');
  }
});

test('consentBridge: preview and a library-made receipt; no waitInfo without a session', async () => {
  const { calls } = fake();
  assert.equal(consentBridge.waitInfo, undefined);
  assert.equal((await consentBridge.preview!({ capture: 'window' }))!.masked_count, 2);
  assert.equal((await consentBridge.recordConsent(input)).decision, 'declined');
  assert.deepEqual(calls[1], ['record', input]);
});

test('a bridge with the session says who is waiting and has the library post every receipt', async () => {
  const { calls } = fake();
  const seen: [string, string | undefined][] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: { headers?: Record<string, string> }) => {
    seen.push([url, init?.headers?.authorization]);
    return new Response(JSON.stringify({ team_name: 'Acme Support', team_avatar_url: null, estimated_wait_seconds: 90 }), { status: 200 });
  }) as typeof fetch;
  try {
    const b = createConsentBridge({ embedToken: TOKEN, sessionId: 'ss_1', server: 'http://127.0.0.1:9000/' });
    assert.equal((await b.waitInfo!())!.estimated_wait_seconds, 90);
    await b.recordConsent(input);
    globalThis.fetch = (async () => new Response('{"error":{"reason":"session_not_found","message":"no"}}', { status: 404 })) as typeof fetch;
    await assert.rejects(b.waitInfo!(), (e: unknown) => e instanceof EmbedError && e.code === 'session_not_found');
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.deepEqual(seen, [['http://127.0.0.1:9000/v1/support/sessions/ss_1/wait', `Bearer ${TOKEN}`]]);
  assert.deepEqual(calls[0], ['record', { ...input, server: 'http://127.0.0.1:9000/', embed_token: TOKEN, session_id: 'ss_1' }]);
});

test('start with a decision: granted, token and receipt sent, capture and guided follow the choices', () => {
  const receipt = { id: 'cr_x', decision: 'accepted', choices } as ConsentReceipt;
  const o = JSON.parse(configJson({ embedToken: TOKEN, company: 'Acme', guided: true, capture: 'window', consentToken: 'gdc_1', consentReceipt: receipt }, undefined));
  assert.deepEqual(
    [o.consent_granted, o.consent_token, o.consent_receipt, o.capture, o.guided],
    [true, 'gdc_1', receipt, 'screen', false],
  );
  const yes = { ...receipt, choices: { ...choices, guided: true } };
  assert.equal(JSON.parse(configJson({ embedToken: TOKEN, company: 'A', guided: true, consentReceipt: yes }, undefined)).guided, true);
  assert.equal(JSON.parse(configJson({ embedToken: TOKEN, company: 'A', consentReceipt: yes }, undefined)).guided, false, 'never more than the app asked');
  assert.equal(JSON.parse(configJson({ embedToken: TOKEN, company: 'A' }, undefined)).consent_granted, false);
});

test('waiting carries the choices; declined and timed-out consents end with their own reason', () => {
  assert.deepEqual(parseEvent('{"type":"state","state":"waiting","choices":{"guided":false,"share_logs":true,"capture":"screen"}}'), {
    type: 'state',
    state: 'waiting',
    choices,
  });
  assert.deepEqual(parseEvent('{"type":"state","state":"connected"}'), { type: 'state', state: 'connected' });
  assert.deepEqual(parseEvent('{"type":"ended","reason":"customer_declined"}'), { type: 'ended', reason: 'customer_declined' });
  assert.deepEqual(parseEvent('{"type":"ended","reason":"consent_timeout"}'), { type: 'ended', reason: 'consent_timeout' });
});
