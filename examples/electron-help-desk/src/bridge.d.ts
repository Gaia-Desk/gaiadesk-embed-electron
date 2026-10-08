// What preload.ts gives the page (window.acme), and what crosses IPC.

/** A box in the page, CSS pixels from the top-left of the content area. */
interface AcmeBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Where the demo's things are; the boxes are already times the page zoom. */
interface AcmeLayout {
  card: AcmeBox;
  blue: AcmeBox;
  buy: AcmeBox;
}

interface AcmeBridge {
  /** The token to prefill the field with ($GAIADESK_EMBED_TOKEN). */
  initialToken(): Promise<string>;
  /** Report the layout (CSS pixels; the preload applies the zoom). */
  layout(rects: AcmeLayout): void;
  /** "Get help" was pressed with this token in the field. */
  getHelp(token: string): void;
  /** "Buy" was pressed; resolves with the click count. */
  buy(): Promise<number>;
  /** Status lines from the main process. */
  onStatus(listener: (text: string) => void): void;
}

interface Window {
  acme: AcmeBridge;
}
