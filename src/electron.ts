// Electron helpers. They take Electron's objects by their shape only and
// never import electron, so this package works (and tests) without it.
//
// Units. Mask rects are relative to the top-left corner of the shared
// window's FRAME (title bar and borders included), in the units the library
// uses: points on macOS (= Electron's DIPs), and on Windows the physical
// pixels of GetWindowRect (Electron is per-monitor DPI aware, so DIPs times
// the display's scale factor). On Linux the rects are passed in DIPs.

/** A rect as the library takes it. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Electron's Rectangle (getBounds, getContentBounds) and DOMRect's fields. */
export interface BoxLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What `windowIdOf` needs of a BrowserWindow. */
export interface MediaSourceWindow {
  getMediaSourceId(): string;
}

/** What `maskRectsFromContent` needs of a BrowserWindow. */
export interface FramedWindow {
  getBounds(): BoxLike;
  getContentBounds(): BoxLike;
}

/**
 * The native id of a BrowserWindow, for `EmbedOptions.windowId`: parsed from
 * `win.getMediaSourceId()` (`"window:<id>:<n>"`), which is the CGWindowID on
 * macOS and the HWND on Windows.
 */
export function windowIdOf(win: MediaSourceWindow): number {
  const source = win.getMediaSourceId();
  const m = /^window:(\d+):\d+$/.exec(source);
  const id = m ? Number(m[1]) : NaN;
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error(`windowIdOf: not a window media source id: ${JSON.stringify(source)}`);
  }
  return id;
}

/** The units multiplier for this platform: the scale factor on Windows, else 1. */
export function unitsPerDip(scaleFactor: number, platform: string = process.platform): number {
  if (platform !== 'win32') return 1;
  return Number.isFinite(scaleFactor) && scaleFactor > 0 ? scaleFactor : 1;
}

/**
 * Content-area rects → mask rects. `rects` are relative to the top-left of
 * the window's content (web page), in CSS pixels already multiplied by the
 * page's zoom factor: `el.getBoundingClientRect()` times
 * `webFrame.getZoomFactor()` in the renderer. They are moved by the offset of
 * the content inside the frame (`getContentBounds()` minus `getBounds()`), and
 * on Windows only multiplied by `scaleFactor` (the window's display's
 * `screen.getDisplayMatching(win.getBounds()).scaleFactor`).
 *
 * Call it again (and `setMaskedRects`) when the layout, the window's size or
 * its display changes.
 */
export function maskRectsFromContent(win: FramedWindow, rects: readonly BoxLike[], scaleFactor: number, platform: string = process.platform): Rect[] {
  const frame = win.getBounds();
  const content = win.getContentBounds();
  const dx = content.x - frame.x;
  const dy = content.y - frame.y;
  const k = unitsPerDip(scaleFactor, platform);
  return rects.map((r) => ({ x: (r.x + dx) * k, y: (r.y + dy) * k, w: r.width * k, h: r.height * k }));
}

/** The window frame's size in the same units as mask rects: `[w, h]`. */
export function frameSizeOf(win: FramedWindow, scaleFactor: number, platform: string = process.platform): [number, number] {
  const b = win.getBounds();
  const k = unitsPerDip(scaleFactor, platform);
  return [b.width * k, b.height * k];
}
