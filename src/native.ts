// The shape of the napi-rs addon (`gaiadesk-embed.<triple>.node`): the thin
// native half. Everything here takes and gives JSON strings and plain
// numbers; the typed API is in index.ts.

/** A rect as the addon takes it. */
export interface NativeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One running session inside the addon. */
export interface NativeEmbedHandle {
  /** End the session (idempotent). `ended` follows as an event. */
  stop(): void;
  /** Replace the masked regions. Throws `"bad_rects: …"`. */
  setMaskRects(rects: NativeRect[]): void;
  /** Pause (or resume) guided input. */
  setPaused(paused: boolean): void;
}

export interface NativeBinding {
  /** `{"version","test_source","codec","os","arch"}` as JSON. */
  buildInfo(): string;
  /** 1 agreed, 0 declined, -1 no native dialog here, -2 wrong thread. */
  showConsent(company: string, capture: string, guided: boolean): number;
  NativeEmbed: {
    /** Throws an Error whose message is `"<code>: <message>"`. */
    start(configJson: string, onEvent: (eventJson: string) => void): NativeEmbedHandle;
  };
}
