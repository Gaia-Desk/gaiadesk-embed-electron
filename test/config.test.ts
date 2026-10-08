// EmbedOptions → the library's config JSON.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { configJson } from '../dist/index';
import type { Consent } from '../dist/index';

const TOKEN = 'gdemb_' + 'a'.repeat(64);
const parse = (s: string): Record<string, unknown> => JSON.parse(s) as Record<string, unknown>;

test('defaults: window capture, not guided; optional keys omitted', () => {
  const o = parse(configJson({ embedToken: TOKEN, company: 'Acme' }, { consentGranted: true }));
  assert.deepEqual(o, { embed_token: TOKEN, consent_granted: true, company: 'Acme', capture: 'window', guided: false });
  assert.ok(!('server' in o) && !('window_id' in o) && !('fps' in o) && !('masks' in o));
});

test('every option, in snake_case', () => {
  const o = parse(
    configJson(
      { embedToken: TOKEN, company: 'Acme', server: 'https://gd.example', capture: 'screen', windowId: 4242, guided: true, fps: 30, masks: [{ x: 10, y: 20, w: 100, h: 30 }] },
      { consentGranted: true },
    ),
  );
  assert.deepEqual(o, {
    embed_token: TOKEN,
    consent_granted: true,
    company: 'Acme',
    capture: 'screen',
    guided: true,
    server: 'https://gd.example',
    window_id: 4242,
    fps: 30,
    masks: [{ x: 10, y: 20, w: 100, h: 30 }],
  });
});

test('consent is true only when literally true', () => {
  const opts = { embedToken: TOKEN, company: 'Acme' };
  for (const c of [{ consentGranted: false }, { consentGranted: 'yes' }, { consentGranted: 1 }, {}, undefined, null]) {
    const o = parse(configJson(opts, c as unknown as Consent));
    assert.equal(o.consent_granted, false, JSON.stringify(c));
  }
  assert.equal(parse(configJson(opts, { consentGranted: true })).consent_granted, true);
});

test('guided is true only when literally true', () => {
  const o = parse(configJson({ embedToken: TOKEN, company: 'Acme', guided: 'yes' as unknown as boolean }, { consentGranted: true }));
  assert.equal(o.guided, false);
});
