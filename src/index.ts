// @gaiadesk/embed-native: share your desktop app's window with your support
// team, from a "Get help" button. A typed TypeScript layer over
// libgaiadesk_embed's Node addon.
//
// What the library itself enforces (no wrapper can skip it): it refuses to
// start without consent; its own "Sharing with <company>" indicator is up for
// as long as anything is shared; only this app's window is captured unless
// you ask for the screen; the rects you mask are painted out of every frame;
// input is off unless you allow `guided` AND the session is "cobrowse", and
// then lands only in this app's own windows while it is in front.
//
// Electron: use it from the MAIN process.

import { configJson } from './config';
import type { Capture, Consent, EmbedOptions } from './config';
import { EmbedError } from './errors';
import { parseEvent } from './events';
import type { EmbedEvent, EndReason } from './events';
import { binding } from './load';
import type { NativeEmbedHandle } from './native';
import type { Rect } from './electron';

export { configJson } from './config';
export type { Capture, Consent, EmbedOptions } from './config';
export { EmbedError } from './errors';
export { parseEvent } from './events';
export type { EmbedEvent, EmbedState, EndReason, SessionMode } from './events';
export { BINARY_ENV, TRIPLES, binaryName, currentTriple, loadBinding, packageName, useBinding } from './load';
export type { LoadEnv, Triple } from './load';
export type { NativeBinding, NativeEmbedHandle, NativeRect } from './native';
export { frameSizeOf, maskRectsFromContent, unitsPerDip, windowIdOf } from './electron';
export type { BoxLike, FramedWindow, MediaSourceWindow, Rect } from './electron';

export type EmbedListener = (event: EmbedEvent) => void;

/** What the bundled binary is. */
export interface BuildInfo {
  version: string;
  /** True only for GaiaDesk's own test builds (a synthetic picture). */
  testSource: boolean;
  codec: string;
  os: string;
  arch: string;
}

/** One support session. */
export class GaiaDeskEmbed {
  /** Resolves with the reason once the session is over (exactly once). */
  readonly ended: Promise<EndReason>;

  private native: NativeEmbedHandle | null = null;
  private readonly listeners = new Set<EmbedListener>();
  private finished = false;
  private resolveEnded!: (reason: EndReason) => void;

  private constructor() {
    this.ended = new Promise((resolve) => {
      this.resolveEnded = resolve;
    });
  }

  /**
   * Start sharing. `consent.consentGranted` must be your user's answer to a
   * consent dialog (`requestConsent`, or your own): the library refuses
   * without it. Events are delivered on the JS thread, in order.
   *
   * @throws EmbedError when refused (`consent_required`, `bad_token`, …).
   */
  static start(options: EmbedOptions, consent: Consent, onEvent?: EmbedListener): GaiaDeskEmbed {
    const json = configJson(options, consent);
    const embed = new GaiaDeskEmbed();
    if (onEvent) embed.listeners.add(onEvent);
    try {
      embed.native = binding().NativeEmbed.start(json, (eventJson) => embed.dispatch(eventJson));
    } catch (e) {
      throw EmbedError.from(e);
    }
    if (embed.finished) embed.native = null;
    return embed;
  }

  /**
   * The library's own consent dialog (modal; on macOS call it from the main
   * thread, which Electron's main process is). Returns whether your user
   * agreed, or `null` when this platform has no native dialog (Linux): show
   * your own, e.g. Electron's `dialog.showMessageBox`.
   */
  static requestConsent(company: string, capture: Capture = 'window', guided = false): boolean | null {
    const rc = binding().showConsent(company, capture, guided);
    if (rc === 1) return true;
    if (rc === 0) return false;
    if (rc === -2) throw new EmbedError('wrong_thread', 'the consent dialog must be shown from the main thread');
    return null;
  }

  /** What the bundled binary is. */
  static buildInfo(): BuildInfo {
    const o = JSON.parse(binding().buildInfo()) as Record<string, unknown>;
    return {
      version: String(o.version ?? ''),
      testSource: o.test_source === true,
      codec: String(o.codec ?? ''),
      os: String(o.os ?? ''),
      arch: String(o.arch ?? ''),
    };
  }

  /** The binary's build info exactly as it reports it (JSON). */
  static buildInfoJson(): string {
    return binding().buildInfo();
  }

  /** Whether the session is over. */
  get isEnded(): boolean {
    return this.finished;
  }

  /** Listen to events. Returns a function that stops listening. */
  on(listener: EmbedListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** End the session. Safe to call more than once; `ended` follows. */
  stop(): void {
    const n = this.native;
    this.native = null;
    n?.stop();
  }

  /**
   * Mask these rects, relative to the top-left of the shared window's frame
   * (points on macOS, physical pixels on Windows; see `maskRectsFromContent`).
   * Replaces any earlier set; `[]` clears. Does nothing once ended.
   *
   * @throws EmbedError `bad_rects`.
   */
  setMaskedRects(rects: readonly Rect[]): void {
    if (!this.native) return;
    try {
      this.native.setMaskRects(rects.map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h })));
    } catch (e) {
      throw EmbedError.from(e);
    }
  }

  /** Pause (or resume) guided input, as the indicator's own button does. */
  setPaused(paused: boolean): void {
    this.native?.setPaused(paused);
  }

  private dispatch(eventJson: string): void {
    if (this.finished) return;
    const event = parseEvent(eventJson);
    if (!event) return;
    if (event.type === 'ended') {
      this.finished = true;
      this.native = null;
      this.resolveEnded(event.reason);
    }
    let failure: unknown;
    let failed = false;
    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch (e) {
        if (!failed) {
          failed = true;
          failure = e;
        }
      }
    }
    if (event.type === 'ended') this.listeners.clear();
    // Every listener ran; a throwing one surfaces like any uncaught error.
    if (failed) throw failure;
  }
}
