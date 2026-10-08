// LIVE: the facade over the REAL addon, when $GAIADESK_EMBED_NATIVE_BINARY
// names one. Only refusals the library makes before touching the network:
// these tests never start a session (and never show the consent dialog).
import { before, test } from 'node:test';
import assert from 'node:assert/strict';

import { BINARY_ENV, EmbedError, GaiaDeskEmbed, useBinding } from '../dist/index';
import type { EmbedOptions } from '../dist/index';

const skip = process.env[BINARY_ENV] ? false : `set ${BINARY_ENV} to a gaiadesk-embed .node to run the live tests`;
const TOKEN = 'gdemb_' + '0123456789abcdef'.repeat(4);

before(() => useBinding(null));

function refused(options: EmbedOptions, consentGranted: boolean): EmbedError {
  try {
    const h = GaiaDeskEmbed.start(options, { consentGranted });
    h.stop();
  } catch (e) {
    assert.ok(e instanceof EmbedError, `not an EmbedError: ${String(e)}`);
    return e;
  }
  assert.fail('the library started a session it should have refused');
}

test('live: buildInfo parses', { skip }, () => {
  const info = GaiaDeskEmbed.buildInfo();
  assert.match(info.version, /^\d+\.\d+\.\d+/);
  assert.equal(typeof info.testSource, 'boolean');
  assert.ok(info.codec.length > 0, 'codec');
  assert.ok(info.os.length > 0 && info.arch.length > 0, 'os/arch');
  assert.deepEqual(JSON.parse(GaiaDeskEmbed.buildInfoJson()).version, info.version);
});

test('live: no consent → consent_required', { skip }, () => {
  const e = refused({ embedToken: TOKEN, company: 'Acme' }, false);
  assert.equal(e.code, 'consent_required');
  assert.match(e.message, /consent_granted/);
});

test('live: consent must be literally true', { skip }, () => {
  const e = refused({ embedToken: TOKEN, company: 'Acme' }, 'true' as unknown as boolean);
  assert.equal(e.code, 'consent_required');
});

test('live: a bad token → bad_token', { skip }, () => {
  assert.equal(refused({ embedToken: 'gdemb_nope', company: 'Acme' }, true).code, 'bad_token');
  assert.equal(refused({ embedToken: '', company: 'Acme' }, true).code, 'bad_token');
});

test('live: a bad server → bad_server', { skip }, () => {
  assert.equal(refused({ embedToken: TOKEN, company: 'Acme', server: 'http://gaiadesk.example' }, true).code, 'bad_server');
});

test('live: fps out of range → bad_config', { skip }, () => {
  assert.equal(refused({ embedToken: TOKEN, company: 'Acme', server: 'https://gaiadesk.invalid', fps: 60 }, true).code, 'bad_config');
});
