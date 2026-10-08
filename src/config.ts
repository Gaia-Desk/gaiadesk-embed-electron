// EmbedOptions → the JSON `gd_embed_start` takes. Pure. The library checks
// every value itself (and refuses with a code); this only spells it right.

/** What is shared. */
export type Capture = 'window' | 'app' | 'screen';

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
}

/** Your user's answer to a consent dialog. */
export interface Consent {
  consentGranted: boolean;
}

/**
 * The config JSON: snake_case keys, `capture` and `guided` always present
 * (defaults `"window"` and `false`), `server`/`window_id`/`fps` only when
 * set, and `consent_granted` true only when the answer is literally `true`.
 */
export function configJson(options: EmbedOptions, consent: Consent | undefined): string {
  const o: Record<string, unknown> = {
    embed_token: options.embedToken,
    consent_granted: consent?.consentGranted === true,
    company: options.company,
    capture: options.capture ?? 'window',
    guided: options.guided === true,
  };
  if (options.server !== undefined) o.server = options.server;
  if (options.windowId !== undefined) o.window_id = options.windowId;
  if (options.fps !== undefined) o.fps = options.fps;
  return JSON.stringify(o);
}
