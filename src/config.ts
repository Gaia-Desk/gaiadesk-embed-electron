// EmbedOptions → the JSON `gd_embed_start` takes. Pure. The library checks
// every value itself (and refuses with a code); this only spells it right.

import type { ConsentReceipt } from './consent';
import type { Rect } from './electron';
import { EmbedError } from './errors';

/** What is shared. */
export type Capture = 'window' | 'app' | 'screen';

/** The screen corner the indicator starts in. */
export type IndicatorPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface EmbedOptions {
  /** `gdemb_…`, from your backend (`POST /v1/support/sessions`). */
  embedToken: string;
  /** Shown on the consent dialog and the indicator ("Sharing with Acme"). */
  company: string;
  /** The GaiaDesk server. Default `https://gaiadesk.net`. */
  server?: string;
  /**
   * `"window"` (default): one window of this app. `"app"`: every window of
   * this app. `"screen"`: the whole display the app's window is on (opt-in).
   */
  capture?: Capture;
  /**
   * The window to share, a window of THIS process: the CGWindowID on macOS,
   * the HWND on Windows. In Electron: `windowIdOf(win)`. Default: the app's
   * frontmost window.
   */
  windowId?: number;
  /** Allow guided input (the session must be "cobrowse" too). Default false. */
  guided?: boolean;
  /** Frames per second, 1 to 30. Default 15. */
  fps?: number;
  /**
   * Regions painted out from the very first frame (same units as
   * `setMaskedRects`; `maskRectsFromContent` makes them). Pass the ones you
   * already know here: an agent can join straight away, and only start-time
   * masks are guaranteed to cover the first frame.
   */
  masks?: readonly Rect[];
  /**
   * Your brand colour, `"#RRGGBB"`: the indicator's stripe and Stop button.
   * Default: the library's own. Needs libgaiadesk_embed 0.2.0.
   */
  brandColor?: string;
  /**
   * Your logo, a PNG (at most 256 KiB) as base64, shown small on the
   * indicator, e.g. `fs.readFileSync('logo.png').toString('base64')`.
   * Needs libgaiadesk_embed 0.2.0.
   */
  logoPngBase64?: string;
  /**
   * The window that asked (an HWND on Windows, an NSWindow* on macOS; in
   * Electron: `parentWindowOf(win)`): the indicator stays clear of it.
   * Ignored unless it is this app's. Default: the app's focused window.
   * Needs libgaiadesk_embed 0.3.0.
   */
  parentWindow?: number;
  /** The corner the indicator starts in. Default: top right, clear of the calling window. Needs 0.3.0. */
  indicatorPosition?: IndicatorPosition;
  /**
   * Where the customer last dragged the indicator: an `indicator_moved`
   * event's `{ x, y }` you kept (the library writes nothing to disk).
   * Restored while it fits on a screen. Needs 0.3.0.
   */
  indicatorOrigin?: { x: number; y: number };
  /**
   * An accepted decision's `consent_token` (`consent()` or `<gaiadesk-consent>`
   * with `consentBridge`, the recommended way to ask): your user's yes, which
   * the library checks. Needs libgaiadesk_embed 0.4.0.
   */
  consentToken?: string;
  /**
   * That decision's `receipt`: sent with the join (stored on the session).
   * `capture` and `guided` follow what your customer chose. Needs 0.4.0.
   */
  consentReceipt?: ConsentReceipt;
}

/** The consent dialog's question, in your look (`requestConsent(options)`). */
export interface ConsentOptions {
  /** Your company's name on the dialog. */
  company: string;
  /** Default `"window"`. */
  capture?: Capture;
  /** Say the agent may click and type. Default false. */
  guided?: boolean;
  /** `"#RRGGBB"`: the dialog's accent. Default: the platform's own. */
  brandColor?: string;
  /** A PNG (at most 256 KiB) as base64, shown on the dialog. Default: the app icon. */
  logoPngBase64?: string;
  /** Say private fields stay hidden (you pass `masks`). Default false. Needs 0.3.0. */
  masked?: boolean;
  /** The window that asked (`parentWindowOf(win)`): the dialog is a sheet on it / owned by it. Needs 0.3.0. */
  parentWindow?: number;
}

/** Your user's answer to a consent dialog. */
export interface Consent {
  consentGranted: boolean;
}

/**
 * The config JSON: snake_case keys, `capture` and `guided` always present
 * (defaults `"window"` and `false`; with a receipt, its choices: the capture
 * chosen, guided only if chosen too), every other key only when set, and
 * `consent_granted` true only when the answer is literally `true` or a
 * consent token or receipt is given (the library checks those).
 */
export function configJson(options: EmbedOptions, consent: Consent | undefined): string {
  const chosen = options.consentReceipt?.choices;
  const o: Record<string, unknown> = {
    embed_token: options.embedToken,
    consent_granted: consent?.consentGranted === true || !!options.consentToken || !!options.consentReceipt,
    company: options.company,
    capture: chosen?.capture ?? options.capture ?? 'window',
    guided: options.guided === true && (chosen ? chosen.guided === true : true),
  };
  if (options.consentToken) o.consent_token = options.consentToken;
  if (options.consentReceipt) o.consent_receipt = options.consentReceipt;
  if (options.server !== undefined) o.server = options.server;
  if (options.windowId !== undefined) o.window_id = options.windowId;
  if (options.fps !== undefined) o.fps = options.fps;
  if (options.masks !== undefined && options.masks.length > 0) o.masks = options.masks.map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h }));
  addBrand(o, options);
  if (options.parentWindow !== undefined) o.parent_window = options.parentWindow;
  if (options.indicatorPosition !== undefined) o.indicator_position = options.indicatorPosition;
  if (options.indicatorOrigin !== undefined) o.indicator_origin = { x: options.indicatorOrigin.x, y: options.indicatorOrigin.y };
  return JSON.stringify(o);
}

/**
 * The JSON `gd_embed_show_consent_ex` takes: `capture` and `guided` always
 * present, `company`, the brand keys, `masked` and `parent_window` only when set.
 *
 * @throws EmbedError `bad_config` for a colour that is not `"#RRGGBB"`.
 */
export function consentJson(options: ConsentOptions): string {
  const o: Record<string, unknown> = { capture: options.capture ?? 'window', guided: options.guided === true };
  if (options.company) o.company = options.company;
  addBrand(o, options);
  if (options.masked === true) o.masked = true;
  if (options.parentWindow !== undefined) o.parent_window = options.parentWindow;
  return JSON.stringify(o);
}

// The library refuses a bad colour too (bad_config); checking here names the field before any native call.
function addBrand(o: Record<string, unknown>, b: { brandColor?: string; logoPngBase64?: string }): void {
  if (b.brandColor !== undefined) {
    if (!/^#[0-9A-Fa-f]{6}$/.test(b.brandColor)) throw new EmbedError('bad_config', `brandColor must be "#RRGGBB" (not ${JSON.stringify(b.brandColor)})`);
    o.brand_color = b.brandColor;
  }
  if (b.logoPngBase64) o.logo_png_base64 = b.logoPngBase64;
}
