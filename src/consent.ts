// The consent step (libgaiadesk_embed 0.4.0): the library's own dialog
// (`consent`), or the `<gaiadesk-consent>` web component in your page with
// `consentBridge`. Options and decisions use the library's snake_case JSON,
// so one options object works for both.

import type { Capture } from './config';
import type { Rect } from './electron';
import { EmbedError } from './errors';
import { binding } from './load';
import type { NativeBinding } from './native';

export interface ConsentTheme {
  appearance?: 'light' | 'dark' | 'auto';
  /** `#RRGGBB` */
  background?: string;
  surface?: string;
  text?: string;
  accent?: string;
  /** px, 0..24 */
  radius?: number;
  /** A family name; falls back to the system UI font. */
  font_family?: string;
  button_style?: 'filled' | 'outline' | 'pill';
}

/**
 * The consent step's options: every key optional, the same object
 * `<gaiadesk-consent>` takes. `masks` and `window_id` as `start`'s (in
 * Electron: `maskRectsFromContent`, `windowIdOf`); `parent_window`:
 * `parentWindowOf(win)`.
 */
export interface ConsentStepOptions {
  company?: string;
  capture?: Capture;
  /** You want click-and-type; your customer may still say no (see `choices`). */
  guided?: boolean;
  /** You pass masks: the dialog says private fields stay hidden. */
  masked?: boolean;
  brand_color?: string;
  logo_png_base64?: string;
  parent_window?: number;
  theme?: ConsentTheme;
  /** `"auto"` (the system's languages) or a BCP-47 tag. */
  locale?: string;
  /** Per-key overrides of the default wording (`{company}`, `{team}`, `{minutes}`, `{count}`). */
  wording?: Record<string, string>;
  wording_version?: string;
  choices?: { offer_guided?: boolean; offer_logs?: boolean; offer_capture?: boolean };
  privacy_url?: string;
  terms_url?: string;
  /** 0 = never; else the dialog declines itself, decision `"timeout"`. */
  timeout_seconds?: number;
  /** The live preview of what support would see (default true). */
  preview?: boolean;
  /** With `embed_token` and `session_id` the library shows who is waiting and posts the receipt itself. */
  server?: string;
  embed_token?: string;
  session_id?: string;
  app_version?: string;
  window_id?: number;
  masks?: Rect[];
}

/** What your customer chose. */
export interface Choices {
  guided: boolean;
  share_logs: boolean;
  capture: Capture;
}

/** The record of the answer: when, which words (version and hash), what was chosen, on which machine account and app. */
export interface ConsentReceipt {
  id: string;
  decision: 'accepted' | 'declined' | 'timeout';
  at: string;
  surface: 'native_dialog' | 'embedded';
  locale: string;
  wording_version: string;
  wording_sha256: string;
  choices: Choices;
  os_user: string | null;
  os: string | null;
  app_name: string | null;
  app_version: string | null;
  sdk: string;
}

/**
 * The decision. `unavailable`: no dialog on this system (show
 * `<gaiadesk-consent>`). Accepted: pass `consent_token` and `receipt` to
 * `start` (`consentToken`, `consentReceipt`).
 */
export interface Decision {
  decision: 'accepted' | 'declined' | 'timeout' | 'unavailable';
  choices?: Choices;
  consent_token?: string;
  receipt?: ConsentReceipt;
}

/** What `<gaiadesk-consent>` hands its bridge on a decision (or your own UI's answer). */
export interface RecordConsentInput {
  decision: 'accepted' | 'declined' | 'timeout';
  choices: Choices;
  /** The strings actually shown. */
  wording: Record<string, string>;
  wording_version: string;
  locale: string;
  company: string;
  capture: Capture;
  app_version: string | null;
}

export interface PreviewRequest {
  capture: Capture;
  parent_window?: number;
  window_id?: number;
  masks?: Rect[];
}

export interface PreviewFrame {
  png_base64: string;
  width: number;
  height: number;
  masked_count: number;
}

export interface WaitInfo {
  team_name: string;
  team_avatar_url: string | null;
  estimated_wait_seconds: number | null;
}

/** `@gaiadesk/consent`'s bridge (structurally: no dependency on that package). */
export interface ConsentBridge {
  preview?(opts: PreviewRequest): Promise<PreviewFrame | null>;
  waitInfo?(): Promise<WaitInfo | null>;
  recordConsent(input: RecordConsentInput): Promise<Decision>;
}

/** The consent dialog's events, in order once it has closed. */
export type ConsentEvent =
  | { type: 'consent_shown'; locale: string; wording_version: string }
  | { type: 'consent_accepted'; choices: Choices }
  | { type: 'consent_declined'; reason: 'declined' | 'timeout' };

/** One consent event's JSON, or null for any other. */
export function parseConsentEvent(json: string): ConsentEvent | null {
  try {
    const e = JSON.parse(json) as { type?: unknown };
    return e && ['consent_shown', 'consent_accepted', 'consent_declined'].includes(e.type as string) ? (e as ConsentEvent) : null;
  } catch {
    return null;
  }
}

function native<K extends 'consent' | 'preview' | 'recordConsentEx'>(name: K): NonNullable<NativeBinding[K]> {
  const f = binding()[name];
  if (!f) throw new EmbedError('unsupported', 'the consent step needs @gaiadesk/embed-native\'s 0.4.0 binary (libgaiadesk_embed 0.4.0)');
  return f as NonNullable<NativeBinding[K]>;
}

function run<T>(f: () => string): T {
  try {
    return JSON.parse(f()) as T;
  } catch (e) {
    throw EmbedError.from(e);
  }
}

/**
 * The library's consent dialog (modal; on macOS from the main thread, which
 * Electron's main process is, else `wrong_thread`): what support will see, a
 * live preview, your customer's choices, who is waiting. Blocks until
 * answered; returns the decision (its receipt made by the library).
 *
 * @throws EmbedError `bad_config`, `wrong_thread`, `unsupported` (an older binary).
 */
export function consent(options: ConsentStepOptions = {}, onEvent?: (event: ConsentEvent) => void): Decision {
  const f = native('consent');
  const sink = onEvent && ((json: string) => {
    const e = parseConsentEvent(json);
    if (e) onEvent(e);
  });
  return run(() => f(JSON.stringify(options), sink));
}

/**
 * One frame of exactly what support would see, masks filled black, at most 480×300.
 *
 * @throws EmbedError `capture_unavailable` (no permission, no window).
 */
export function preview(request: PreviewRequest = { capture: 'window' }): PreviewFrame {
  const f = native('preview');
  return run(() => f(JSON.stringify(request)));
}

/**
 * Your own (or the embedded) consent UI's answer, made a receipt by the
 * library (`surface: "embedded"`). With `server`, `embed_token` and
 * `session_id` it posts the receipt too (a decline or timeout then ends the
 * waiting request).
 */
export function recordConsent(input: RecordConsentInput & { server?: string; embed_token?: string; session_id?: string }): Decision {
  const f = native('recordConsentEx');
  return run(() => f(JSON.stringify(input)));
}

/** The session a bridge posts receipts to and asks who is waiting for. */
export interface BridgeSession {
  embedToken: string;
  sessionId: string;
  /** The GaiaDesk API. Default `https://api.gaiadesk.net`. */
  server?: string;
}

/** Who is waiting (`GET /v1/support/sessions/{id}/wait`). */
export async function waitInfo(session: BridgeSession, fetchImpl: typeof fetch = fetch): Promise<WaitInfo> {
  const base = (session.server ?? 'https://api.gaiadesk.net').replace(/\/+$/, '');
  const r = await fetchImpl(`${base}/v1/support/sessions/${encodeURIComponent(session.sessionId)}/wait`, {
    headers: { authorization: `Bearer ${session.embedToken}` },
  });
  const body = (await r.json().catch(() => null)) as { error?: { reason?: string; message?: string } } | null;
  if (!r.ok) throw new EmbedError(body?.error?.reason ?? `http_${r.status}`, body?.error?.message ?? `HTTP ${r.status}`);
  return body as WaitInfo;
}

/**
 * A bridge for `<gaiadesk-consent>`, for the main or preload side (expose it
 * with `contextBridge.exposeInMainWorld`). With the session (from your
 * backend's create) it also says who is waiting and has the library post
 * every receipt, so a decline ends the request at once; without, an
 * accepted receipt is posted by `start`.
 */
export function createConsentBridge(session?: BridgeSession): ConsentBridge {
  const bridge: ConsentBridge = {
    preview: async (opts) => preview(opts),
    recordConsent: async (input) =>
      recordConsent(session ? { ...input, server: session.server ?? 'https://api.gaiadesk.net', embed_token: session.embedToken, session_id: session.sessionId } : input),
  };
  if (session) bridge.waitInfo = () => waitInfo(session);
  return bridge;
}

/** `el.bridge = consentBridge`: the preview and a library-made receipt (see `createConsentBridge`). */
export const consentBridge: ConsentBridge = createConsentBridge();
