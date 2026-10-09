# Changelog

## 0.1.0

The first release: GaiaDesk's built-in help desk for Electron and Node desktop apps, over the
native library libgaiadesk_embed.

- `GaiaDeskEmbed.start(options, { consentGranted }, onEvent?)`, `.on()`, `.stop()`,
  `.setMaskedRects()`, `.setPaused()`, `.ended` (a promise of the end reason), and refusals as
  `EmbedError` with a stable `code`.
- `GaiaDeskEmbed.requestConsent()`: the library's native consent dialog on macOS and Windows,
  `null` where there is none (Linux: show Electron's `dialog.showMessageBox`).
- Typed events (`state`, `code`, `joined`, `left`, `control`, `action`, `error`, `ended`) with a
  strict parser that ignores types it does not know.
- Electron helpers that do not import Electron: `windowIdOf(win)` (CGWindowID / HWND from
  `getMediaSourceId()`) and `maskRectsFromContent(win, rects, scaleFactor)` (page rects → the
  window-frame rects the library masks).
- The loader: `$GAIADESK_EMBED_NATIVE_BINARY`, a local `gaiadesk-embed.<triple>.node`, or the
  `@gaiadesk/embed-native-<triple>` package for darwin-arm64, darwin-x64, win32-x64-msvc and
  linux-x64-gnu.
- `examples/electron-help-desk`: "Acme Desk", with a masked card number and a Buy button.
