// The loader: which triple, which file, and what it says when nothing loads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';

import { BINARY_ENV, TRIPLES, binaryName, currentTriple, loadBinding, packageName } from '../dist/index';
import type { LoadEnv, NativeBinding } from '../dist/index';

const glibc = (): boolean => false;
const musl = (): boolean => true;

test('triples: every published platform resolves, others are null', () => {
  assert.equal(currentTriple('darwin', 'arm64', glibc), 'darwin-arm64');
  assert.equal(currentTriple('darwin', 'x64', glibc), 'darwin-x64');
  assert.equal(currentTriple('win32', 'x64', glibc), 'win32-x64-msvc');
  assert.equal(currentTriple('linux', 'x64', glibc), 'linux-x64-gnu');
  assert.equal(currentTriple('linux', 'x64', musl), null, 'musl has no binary');
  assert.equal(currentTriple('linux', 'arm64', glibc), null);
  assert.equal(currentTriple('win32', 'arm64', glibc), null);
  assert.equal(currentTriple('win32', 'ia32', glibc), null);
  assert.equal(currentTriple('freebsd', 'x64', glibc), null);
  assert.deepEqual([...TRIPLES].sort(), ['darwin-arm64', 'darwin-x64', 'linux-x64-gnu', 'win32-x64-msvc']);
});

test('names: the binary and its platform package', () => {
  assert.equal(binaryName('darwin-arm64'), 'gaiadesk-embed.darwin-arm64.node');
  assert.equal(packageName('win32-x64-msvc'), '@gaiadesk/embed-native-win32-x64-msvc');
});

const FAKE = { marker: true } as unknown as NativeBinding;

function env(over: Partial<LoadEnv>, required: string[]): Partial<LoadEnv> {
  return {
    env: {},
    platform: 'darwin',
    arch: 'arm64',
    musl: glibc,
    packageDir: '/pkg',
    exists: () => false,
    require: (id: string) => {
      required.push(id);
      throw new Error(`Cannot find module '${id}'`);
    },
    ...over,
  };
}

test('load order: the env path first', () => {
  const req: string[] = [];
  const b = loadBinding(env({ env: { [BINARY_ENV]: 'rel/x.node' }, require: (id) => (req.push(id), FAKE) }, req));
  assert.equal(b, FAKE);
  assert.deepEqual(req, [resolve('rel/x.node')]);
});

test('load order: a local binary beside the package before the platform package', () => {
  const req: string[] = [];
  const local = join('/pkg', 'gaiadesk-embed.darwin-arm64.node');
  const b = loadBinding(env({ exists: (p) => p === local, require: (id) => (req.push(id), FAKE) }, req));
  assert.equal(b, FAKE);
  assert.deepEqual(req, [local]);
});

test('load order: the platform package last', () => {
  const req: string[] = [];
  const b = loadBinding(env({ platform: 'win32', arch: 'x64', require: (id) => (req.push(id), FAKE) }, req));
  assert.equal(b, FAKE);
  assert.deepEqual(req, ['@gaiadesk/embed-native-win32-x64-msvc']);
});

test('nothing loads: the error names everything tried', () => {
  const req: string[] = [];
  assert.throws(
    () => loadBinding(env({}, req)),
    (e: Error) => {
      assert.match(e.message, /GAIADESK_EMBED_NATIVE_BINARY \(not set\)/);
      assert.ok(e.message.includes(join('/pkg', 'gaiadesk-embed.darwin-arm64.node') + ' (not found)'), e.message);
      assert.match(e.message, /@gaiadesk\/embed-native-darwin-arm64 \(Cannot find module/);
      assert.match(e.message, /optional/);
      return true;
    },
  );
  assert.deepEqual(req, ['@gaiadesk/embed-native-darwin-arm64']);
});

test('a broken env path says so', () => {
  const req: string[] = [];
  assert.throws(() => loadBinding(env({ env: { [BINARY_ENV]: '/nope.node' } }, req)), /GAIADESK_EMBED_NATIVE_BINARY \(\/nope\.node\): Cannot find module/);
});

test('an unsupported platform names the published ones', () => {
  const req: string[] = [];
  assert.throws(() => loadBinding(env({ platform: 'linux', arch: 'x64', musl }, req)), /no binary for linux-x64 \(glibc only\).*darwin-arm64/);
  assert.deepEqual(req, []);
});
