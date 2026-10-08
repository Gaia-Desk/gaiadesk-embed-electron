// Event JSON → typed events: every type, and what is ignored.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseEvent } from '../dist/index';

test('state', () => {
  for (const s of ['starting', 'waiting', 'connected', 'ended']) {
    assert.deepEqual(parseEvent(JSON.stringify({ type: 'state', state: s })), { type: 'state', state: s });
  }
  assert.equal(parseEvent('{"type":"state","state":"dancing"}'), null);
  assert.equal(parseEvent('{"type":"state"}'), null);
});

test('code', () => {
  assert.deepEqual(parseEvent('{"type":"code","code":"123456789","session_id":"ss_1","mode":"cobrowse","expires_at":1760000000}'), {
    type: 'code',
    code: '123456789',
    sessionId: 'ss_1',
    mode: 'cobrowse',
    expiresAt: 1760000000,
  });
  assert.deepEqual(parseEvent('{"type":"code","code":"1","session_id":"ss_1","mode":"view"}'), {
    type: 'code',
    code: '1',
    sessionId: 'ss_1',
    mode: 'view',
    expiresAt: null,
  });
  assert.equal(parseEvent('{"type":"code","code":"1","session_id":"ss_1","mode":"drive"}'), null);
  assert.equal(parseEvent('{"type":"code","code":1,"session_id":"ss_1","mode":"view"}'), null);
});

test('joined, left', () => {
  assert.deepEqual(parseEvent('{"type":"joined","agent":"agent@acme.com"}'), { type: 'joined', agent: 'agent@acme.com' });
  assert.deepEqual(parseEvent('{"type":"joined","agent":null}'), { type: 'joined', agent: null });
  assert.deepEqual(parseEvent('{"type":"joined"}'), { type: 'joined', agent: null });
  assert.equal(parseEvent('{"type":"joined","agent":7}'), null);
  assert.deepEqual(parseEvent('{"type":"left"}'), { type: 'left' });
});

test('control', () => {
  assert.deepEqual(parseEvent('{"type":"control","allowed":true}'), { type: 'control', allowed: true });
  assert.deepEqual(parseEvent('{"type":"control","allowed":false}'), { type: 'control', allowed: false });
  assert.equal(parseEvent('{"type":"control","allowed":"no"}'), null);
});

test('action', () => {
  assert.deepEqual(parseEvent('{"type":"action","action":"click","applied":false,"reason":"not_focused"}'), {
    type: 'action',
    action: 'click',
    applied: false,
    reason: 'not_focused',
  });
  assert.deepEqual(parseEvent('{"type":"action","action":"type","applied":true,"reason":null}'), {
    type: 'action',
    action: 'type',
    applied: true,
    reason: null,
  });
  assert.equal(parseEvent('{"type":"action","action":"click"}'), null);
});

test('error', () => {
  assert.deepEqual(parseEvent('{"type":"error","code":"capture_failed","message":"no window"}'), {
    type: 'error',
    code: 'capture_failed',
    message: 'no window',
  });
  assert.equal(parseEvent('{"type":"error","code":"x"}'), null);
});

test('ended: every reason, and never lost', () => {
  for (const r of ['stopped', 'app_stopped', 'disconnected', 'expired', 'error']) {
    assert.deepEqual(parseEvent(JSON.stringify({ type: 'ended', reason: r })), { type: 'ended', reason: r });
  }
  assert.deepEqual(parseEvent('{"type":"ended","reason":"meteor"}'), { type: 'ended', reason: 'error' });
  assert.deepEqual(parseEvent('{"type":"ended"}'), { type: 'ended', reason: 'error' });
});

test('unknown types and junk are ignored', () => {
  assert.equal(parseEvent('{"type":"telemetry","x":1}'), null);
  assert.equal(parseEvent('{"state":"waiting"}'), null);
  assert.equal(parseEvent('not json'), null);
  assert.equal(parseEvent('[]'), null);
  assert.equal(parseEvent('null'), null);
  assert.equal(parseEvent('"ended"'), null);
});

test('extra fields do not leak through', () => {
  assert.deepEqual(parseEvent('{"type":"left","secret":"x"}'), { type: 'left' });
});
