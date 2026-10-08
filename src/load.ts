// Finding the binary for this machine, napi-rs style: one optional npm
// package per platform (`@gaiadesk/embed-native-<triple>`), each holding
// `gaiadesk-embed.<triple>.node`. npm installs only the one whose os/cpu/libc
// match.

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import type { NativeBinding } from './native';

/** Every platform a binary is published for. */
export const TRIPLES = ['darwin-arm64', 'darwin-x64', 'win32-x64-msvc', 'linux-x64-gnu'] as const;
export type Triple = (typeof TRIPLES)[number];

/** The environment variable naming a binary to load instead (a path). */
export const BINARY_ENV = 'GAIADESK_EMBED_NATIVE_BINARY';

function isMusl(): boolean {
  // glibc's runtime version is in the process report; musl has none.
  const report = (process.report?.getReport?.() ?? {}) as { header?: { glibcVersionRuntime?: string } };
  return !report.header?.glibcVersionRuntime;
}

/** This machine's triple, or null when no binary is published for it. */
export function currentTriple(platform: string = process.platform, arch: string = process.arch, musl: () => boolean = isMusl): Triple | null {
  if (platform === 'darwin' && (arch === 'arm64' || arch === 'x64')) return `darwin-${arch}`;
  if (platform === 'win32' && arch === 'x64') return 'win32-x64-msvc';
  if (platform === 'linux' && arch === 'x64' && !musl()) return 'linux-x64-gnu';
  return null;
}

export const binaryName = (t: Triple): string => `gaiadesk-embed.${t}.node`;
export const packageName = (t: Triple): string => `@gaiadesk/embed-native-${t}`;

/** What `loadBinding` looks at; every part can be replaced (tests). */
export interface LoadEnv {
  env: NodeJS.ProcessEnv;
  platform: string;
  arch: string;
  musl: () => boolean;
  /** The directory a local `gaiadesk-embed.<triple>.node` is looked for in. */
  packageDir: string;
  exists: (path: string) => boolean;
  require: (id: string) => unknown;
}

function defaultLoadEnv(): LoadEnv {
  return {
    env: process.env,
    platform: process.platform,
    arch: process.arch,
    musl: isMusl,
    packageDir: join(__dirname, '..'),
    exists: existsSync,
    require: (id) => require(id),
  };
}

const describe = (e: unknown): string => (e instanceof Error ? e.message : String(e)).split('\n')[0];

/**
 * Load the binary: `$GAIADESK_EMBED_NATIVE_BINARY` (a path), then a
 * `gaiadesk-embed.<triple>.node` beside this package (local builds), then the
 * platform package. Throws an Error naming everything it tried.
 */
export function loadBinding(over: Partial<LoadEnv> = {}): NativeBinding {
  const l: LoadEnv = { ...defaultLoadEnv(), ...over };
  const explicit = l.env[BINARY_ENV];
  if (explicit) {
    try {
      return l.require(resolve(explicit)) as NativeBinding;
    } catch (e) {
      throw new Error(`@gaiadesk/embed-native: could not load $${BINARY_ENV} (${explicit}): ${describe(e)}`);
    }
  }
  const t = currentTriple(l.platform, l.arch, l.musl);
  if (!t) {
    const libc = l.platform === 'linux' ? ' (glibc only)' : '';
    throw new Error(
      `@gaiadesk/embed-native has no binary for ${l.platform}-${l.arch}${libc}: binaries exist for ${TRIPLES.join(', ')}. ` +
        `Set $${BINARY_ENV} to a gaiadesk-embed .node file to use another.`,
    );
  }
  const tried: string[] = [`$${BINARY_ENV} (not set)`];
  const local = join(l.packageDir, binaryName(t));
  if (l.exists(local)) {
    try {
      return l.require(local) as NativeBinding;
    } catch (e) {
      tried.push(`${local} (${describe(e)})`);
    }
  } else {
    tried.push(`${local} (not found)`);
  }
  try {
    return l.require(packageName(t)) as NativeBinding;
  } catch (e) {
    tried.push(`${packageName(t)} (${describe(e)})`);
  }
  throw new Error(
    `@gaiadesk/embed-native: no native binary for ${t}. Tried: ${tried.join('; ')}. ` +
      `Reinstall with optional dependencies enabled (npm install --include=optional), or set $${BINARY_ENV}.`,
  );
}

let cached: NativeBinding | null = null;

/** The binding in use: loaded on first use, or the one `useBinding` set. */
export function binding(): NativeBinding {
  if (!cached) cached = loadBinding();
  return cached;
}

/**
 * Use this binding instead of loading one (tests, or a binary you load
 * yourself). `null` forgets it, so the next use loads the real one.
 */
export function useBinding(b: NativeBinding | null): void {
  cached = b;
}
