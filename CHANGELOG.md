# Changelog

## 0.2.0

- libgaiadesk_embed 0.2.0: white-label branding. `EmbedOptions.brandColor` (`#RRGGBB`) and
  `EmbedOptions.logoPngBase64` (a PNG, at most 256 KiB) put your colour and logo on the
  "Sharing with <company>" indicator; `GaiaDeskEmbed.requestConsent({ company, …, brandColor,
  logoPngBase64 })` shows the consent dialog in your look. A colour that is not `#RRGGBB` throws
  `EmbedError` (`bad_config`) before the native call; a colour or logo the library refuses throws
  `bad_config` instead of reading as a decline. `consentJson(options)` shows the dialog's JSON.
- No customer-visible text names GaiaDesk any more (connect errors, the Linux indicator).

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
