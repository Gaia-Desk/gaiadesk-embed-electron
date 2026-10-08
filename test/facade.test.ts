// GaiaDeskEmbed over a FAKE binding: what reaches the addon, and what the
// app gets back.
import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';

import { EmbedError, GaiaDeskEmbed, useBinding } from '../dist/index';
import type { EmbedEvent, NativeBinding, NativeRect } from '../dist/index';

const TOKEN = 'gdemb_' + 'b'.repeat(64);

interface Fake {
  binding: NativeBinding;
  configs: Record<string, unknown>[];
  /** Send an event the way the addon does (later, on the JS thread). */
  emit: (o: object) => Promise<void>;
  stops: number;
  masks: NativeRect[][];
  paused: boolean[];
  consent: { rc: number; args: unknown[][] };
  /** Thrown from start, as the addon does: "<code>: <message>". */
  refuse: string | null;
  /** Masks the addon rejects. */
  badRects: boolean;
  /** What the event callback threw. */
  thrown: unknown[];
}

const tick = (): Promise<void> => new Promise((r) => setImmediate(r));

function fake(): Fake {
  let sink: ((json: string) => void) | null = null;
  const f: Fake = {
    configs: [],
    stops: 0,
    masks: [],
    paused: [],
    consent: { rc: 1, args: [] },
    refuse: null,
    badRects: false,
    thrown: [],
    emit: async (o) => {
      const s = sink;
      await tick();
      // The addon's threadsafe function would surface a throw as an
      // uncaught exception; the fake records it.
      try {
        s?.(JSON.stringify(o));
      } catch (e) {
        f.thrown.push(e);
      }
    },
    binding: {
      buildInfo: () => '{"version":"0.1.0","test_source":false,"codec":"h264","os":"macos","arch":"aarch64"}',
      showConsent: (...args: unknown[]) => {
        f.consent.args.push(args);
        return f.consent.rc;
      },
      NativeEmbed: {
        start: (json, onEvent) => {
          f.configs.push(JSON.parse(json) as Record<string, unknown>);
          if (f.refuse) throw new Error(f.refuse);
          sink = onEvent;
          void f.emit({ type: 'state', state: 'starting' });
          return {
            stop: () => {
              f.stops++;
              void f.emit({ type: 'state', state: 'ended' }).then(() => f.emit({ type: 'ended', reason: 'app_stopped' }));
            },
            setMaskRects: (rects) => {
              if (f.badRects) throw new Error('bad_rects: at most 64 rects');
              f.masks.push(rects);
            },
            setPaused: (p) => {
              f.paused.push(p);
            },
          };
        },
      },
    },
  };
  return f;
}

let f: Fake;
beforeEach(() => {
  f = fake();
  useBinding(f.binding);
});
afterEach(() => useBinding(null));

test('start passes the config and delivers typed events in order', async () => {
  const seen: EmbedEvent[] = [];
  const help = GaiaDeskEmbed.start({ embedToken: TOKEN, company: 'Acme', windowId: 77 }, { consentGranted: true }, (e) => seen.push(e));
  assert.deepEqual(f.configs, [{ embed_token: TOKEN, consent_granted: true, company: 'Acme', capture: 'window', guided: false, window_id: 77 }]);
  await tick();
  await f.emit({ type: 'code', code: '123456789', session_id: 'ss_1', mode: 'view', expires_at: 5 });
  await f.emit({ type: 'telemetry', whatever: 1 });
  await f.emit({ type: 'joined', agent: 'a@acme.com' });
  await f.emit({ type: 'left' });
  assert.deepEqual(seen, [
    { type: 'state', state: 'starting' },
    { type: 'code', code: '123456789', sessionId: 'ss_1', mode: 'view', expiresAt: 5 },
    { type: 'joined', agent: 'a@acme.com' },
    { type: 'left' },
  ]);
  assert.equal(help.isEnded, false);
  help.stop();
  assert.equal(await help.ended, 'app_stopped');
});

test('on() adds listeners and returns an unsubscribe', async () => {
  const help = GaiaDeskEmbed.start({ embedToken: TOKEN, company: 'Acme' }, { consentGranted: true });
  const a: string[] = [];
  const b: string[] = [];
  help.on((e) => a.push(e.type));
  const off = help.on((e) => b.push(e.type));
  await tick();
  off();
  await f.emit({ type: 'left' });
  assert.deepEqual(a, ['state', 'left']);
  assert.deepEqual(b, ['state']);
  help.stop();
  await help.ended;
});

test('ended resolves once; nothing is delivered after it', async () => {
  const seen: string[] = [];
  const help = GaiaDeskEmbed.start({ embedToken: TOKEN, company: 'Acme' }, { consentGranted: true }, (e) => seen.push(e.type === 'ended' ? `ended:${e.reason}` : e.type));
  await tick();
  await f.emit({ type: 'ended', reason: 'expired' });
  await f.emit({ type: 'ended', reason: 'stopped' });
  await f.emit({ type: 'left' });
  assert.equal(await help.ended, 'expired');
  assert.deepEqual(seen, ['state', 'ended:expired']);
  assert.equal(help.isEnded, true);
  // Once ended, the handle is inert.
  help.setMaskedRects([{ x: 0, y: 0, w: 1, h: 1 }]);
  help.setPaused(true);
  help.stop();
  assert.equal(f.stops, 0);
  assert.deepEqual(f.masks, []);
  assert.deepEqual(f.paused, []);
});

test('stop is idempotent', async () => {
  const help = GaiaDeskEmbed.start({ embedToken: TOKEN, company: 'Acme' }, { consentGranted: true });
  help.stop();
  help.stop();
  help.stop();
  assert.equal(f.stops, 1);
  assert.equal(await help.ended, 'app_stopped');
  help.stop();
  assert.equal(f.stops, 1);
});

test('a refusal is an EmbedError with the code', () => {
  f.refuse = 'consent_required: consent_granted must be true';
  assert.throws(
    () => GaiaDeskEmbed.start({ embedToken: TOKEN, company: 'Acme' }, { consentGranted: false }),
    (e: unknown) => {
      assert.ok(e instanceof EmbedError);
      assert.ok(e instanceof Error);
      assert.equal(e.code, 'consent_required');
      assert.equal(e.message, 'consent_granted must be true');
      return true;
    },
  );
  assert.equal(f.configs[0].consent_granted, false);
  f.refuse = 'something odd happened';
  assert.throws(() => GaiaDeskEmbed.start({ embedToken: TOKEN, company: 'Acme' }, { consentGranted: true }), { code: 'unknown', message: 'something odd happened' });
});

test('masks and pause reach the addon; bad rects are an EmbedError', async () => {
  const help = GaiaDeskEmbed.start({ embedToken: TOKEN, company: 'Acme', guided: true }, { consentGranted: true });
  help.setMaskedRects([{ x: 1, y: 2, w: 3, h: 4, extra: true } as never]);
  help.setMaskedRects([]);
  help.setPaused(true);
  help.setPaused(false);
  assert.deepEqual(f.masks, [[{ x: 1, y: 2, w: 3, h: 4 }], []]);
  assert.deepEqual(f.paused, [true, false]);
  f.badRects = true;
  assert.throws(() => help.setMaskedRects([{ x: 0, y: 0, w: 1, h: 1 }]), { name: 'EmbedError', code: 'bad_rects' });
  help.stop();
  await help.ended;
});

test('a throwing listener does not stop the others, and ended still resolves', async () => {
  const help = GaiaDeskEmbed.start({ embedToken: TOKEN, company: 'Acme' }, { consentGranted: true });
  const seen: string[] = [];
  help.on(() => {
    throw new Error('app bug');
  });
  help.on((e) => seen.push(e.type));
  await tick();
  help.stop();
  assert.equal(await help.ended, 'app_stopped');
  assert.deepEqual(seen, ['state', 'state', 'ended']);
  assert.equal(f.thrown.length, 3);
  assert.match(String(f.thrown[0]), /app bug/);
});

test('requestConsent maps the dialog result', () => {
  f.consent.rc = 1;
  assert.equal(GaiaDeskEmbed.requestConsent('Acme'), true);
  f.consent.rc = 0;
  assert.equal(GaiaDeskEmbed.requestConsent('Acme', 'app', true), false);
  f.consent.rc = -1;
  assert.equal(GaiaDeskEmbed.requestConsent('Acme'), null);
  f.consent.rc = -2;
  assert.throws(() => GaiaDeskEmbed.requestConsent('Acme'), { code: 'wrong_thread' });
  assert.deepEqual(f.consent.args[0], ['Acme', 'window', false]);
  assert.deepEqual(f.consent.args[1], ['Acme', 'app', true]);
});

test('buildInfo is typed', () => {
  assert.deepEqual(GaiaDeskEmbed.buildInfo(), { version: '0.1.0', testSource: false, codec: 'h264', os: 'macos', arch: 'aarch64' });
  assert.match(GaiaDeskEmbed.buildInfoJson(), /"test_source":false/);
});
