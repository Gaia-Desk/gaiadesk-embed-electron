# @gaiadesk/embed-native

A **"Get help" button for your Electron (or Node) desktop app**. Your customer clicks it and
agrees; your app's window is shared with **your** support team, who see it in the GaiaDesk
console's Support page and, if you allow it, guide it: click and type **inside your app only**,
while it is in front.

- TypeScript, typed events, no runtime dependencies besides the prebuilt native library for your
  platform.
- The library's own consent dialog (macOS, Windows), or yours.
- A visible **"Sharing with Acme"** indicator, owned by the library, for as long as anything is
  shared.
- Only your app's window by default. Rects you mask (card numbers, balances) are **painted out of
  every frame** before it is encoded.
- View-only unless you opt in; guided input is delivered inside your app's own process, never
  through the operating system's input stream.

```sh
npm install @gaiadesk/embed-native
```

npm installs the native library for your platform as an optional dependency
(`@gaiadesk/embed-native-<platform>`): macOS (Apple silicon and Intel), Windows x64, and Linux x64
(glibc). Keep optional dependencies on (`--include=optional`), and when you package with
electron-builder or Forge, unpack `*.node` files from the asar archive (`asarUnpack`).

## Quick start (Electron main process)

Your server creates a support session with a secret API key (scope `support`) and hands the app its
`embed_token`:

```sh
curl -s -X POST https://api.gaiadesk.net/v1/support/sessions \
  -H "Authorization: Bearer $GAIADESK_API_KEY" -H "Content-Type: application/json" \
  -d '{"mode": "view", "customer": {"name": "Ada", "plan": "pro"}}'
# → {"id": "ss_…", "join_code": "123456789", "embed_token": "gdemb_…", …}
```

Then, in the **main** process (the library's indicator lives on Electron's main thread):

```ts
import { dialog, type BrowserWindow } from "electron";
import { GaiaDeskEmbed, EmbedError, windowIdOf } from "@gaiadesk/embed-native";

async function getHelp(win: BrowserWindow, embedToken: string) {
  // 1. Ask. The library's dialog where there is one, Electron's elsewhere (Linux).
  const agreed =
    GaiaDeskEmbed.requestConsent("Acme", "window") ??
    (await dialog.showMessageBox(win, {
      message: "Share this window with Acme support?",
      detail: "Acme support will see this window, not the rest of your screen. You can stop at any time.",
      buttons: ["Share", "Don't share"],
      cancelId: 1,
    })).response === 0;
  if (!agreed) return;

  // 2. Start, with the answer.
  try {
    const help = GaiaDeskEmbed.start(
      { embedToken, company: "Acme", windowId: windowIdOf(win) },
      { consentGranted: agreed },
      (e) => {
        if (e.type === "code") console.log("support code", e.code);
        if (e.type === "joined") console.log(e.agent ?? "an agent", "is viewing");
      },
    );
    console.log("ended:", await help.ended);
  } catch (e) {
    if (e instanceof EmbedError) console.error(e.code, e.message); // bad_token, consent_required, …
    else throw e;
  }
}
```

`examples/electron-help-desk` is a complete app ("Acme Desk"): a masked card number, a Buy
button, a token field and Get help.

## Consent is required

`start` refuses (`EmbedError` with code `consent_required`) unless `consentGranted` is literally
`true`, and that must be your user's answer to a consent dialog: `GaiaDeskEmbed.requestConsent`
(the library's own, modal, on macOS and Windows) or your own. `requestConsent` returns `true` or
`false`, or `null` where the platform has no native dialog (Linux): show your own, e.g. Electron's
`dialog.showMessageBox`. Say who will see what, and whether they can act.

## Masking

Pass the regions you already know as `masks` in the start options: an agent can join straight
away, and only start-time masks are guaranteed to cover the first frame. `setMaskedRects`
replaces them afterwards. Mask rects are relative to the **top-left corner of the shared window's frame** (title bar
included): points on macOS, physical pixels (`GetWindowRect`) on Windows. From a web page, measure
in the renderer and convert in the main process:

```ts
// preload.ts (contextIsolation): CSS pixels × page zoom
const z = webFrame.getZoomFactor();
const r = el.getBoundingClientRect();
ipcRenderer.send("masks", [{ x: r.left * z, y: r.top * z, width: r.width * z, height: r.height * z }]);

// main.ts
import { screen } from "electron";
import { maskRectsFromContent } from "@gaiadesk/embed-native";

ipcMain.on("masks", (_e, boxes) => {
  const scale = screen.getDisplayMatching(win.getBounds()).scaleFactor;
  help.setMaskedRects(maskRectsFromContent(win, boxes, scale));
});
```

`maskRectsFromContent` moves page rects by the content area's offset in the frame
(`getContentBounds()` minus `getBounds()`), and on **Windows only** multiplies by the display's
scale factor (Electron is per-monitor DPI aware; the library takes physical pixels there). Send the
masks again whenever the layout changes, the window is resized, or it moves to another display.
`setMaskedRects([])` clears them. Masks fail closed: if the window cannot be located, the whole
picture is painted out.

## Guided mode

Sessions are **view-only by default**. Guided input (the agent clicks, scrolls, types and presses
a few keys) needs **both**:

- `guided: true` in your options, **and**
- a `"cobrowse"` support session (your backend's `mode`).

Even then, a request is applied only when it lands on **your app's own windows while your app is
focused**, not under a mask, at most 20 a second. Your customer can **Pause control** (and allow it
again) on the indicator; you can too, with `setPaused(true)`. Every request is reported as an
`action` event with `applied` and a `reason` (`view_only`, `control_paused`, `rate_limited`,
`not_focused`, `outside_app`, `masked`, `unsupported`).

**Linux is view-only** in this release: X11 has no way to deliver input to one app only.

## The indicator

While anything is shared the library shows its own **"Sharing with <company>"** panel with **Stop
sharing** (and, in guided sessions, Pause / Allow control). Frames are sent only while it is up.
Stop ends everything; you get `ended` with reason `stopped`.

## API

| | |
|---|---|
| `GaiaDeskEmbed.start(options, { consentGranted }, onEvent?)` | start sharing; throws `EmbedError` (`.code`) |
| `help.on(listener)` | listen to events; returns an unsubscribe function |
| `help.stop()` | end the session (safe to call again); `ended` follows with `app_stopped` |
| `help.setMaskedRects(rects)` | replace the masked rects (`{ x, y, w, h }[]`) |
| `help.setPaused(paused)` | pause or resume guided input |
| `help.ended` | a promise of the end reason, resolved exactly once |
| `GaiaDeskEmbed.requestConsent(company, capture?, guided?)` | `true` / `false`, or `null` with no native dialog |
| `GaiaDeskEmbed.buildInfo()` | `{ version, testSource, codec, os, arch }` of the native library |
| `windowIdOf(win)` | a BrowserWindow's CGWindowID (macOS) / HWND (Windows), for `windowId` |
| `maskRectsFromContent(win, rects, scaleFactor)` | page rects → mask rects (see Masking) |

| Option | |
|---|---|
| `embedToken` | `gdemb_…`, from your backend |
| `company` | shown on the consent dialog and the indicator |
| `server` | the GaiaDesk server (default `https://gaiadesk.net`) |
| `capture` | `"window"` (default): one window of your app; `"app"`: all of its windows; `"screen"`: the display it is on (opt-in) |
| `windowId` | the window to share (`windowIdOf(win)`); default: your app's frontmost |
| `guided` | allow guided input (default `false`; see Guided mode) |
| `fps` | 1 to 30 (default 15) |

| Event | |
|---|---|
| `state` | `{ state }`: `starting`, `waiting`, `connected`, `ended` |
| `code` | `{ code, sessionId, mode, expiresAt }`: the session is up; `code` is the support code your customer reads to the agent |
| `joined` / `left` | `{ agent }` (the agent's email, or `null`) / `{}` |
| `control` | `{ allowed }`: guided input paused (`false`) or allowed again |
| `action` | `{ action, applied, reason }`: an agent's request and what became of it |
| `error` | `{ code, message }` |
| `ended` | `{ reason }`: `stopped`, `app_stopped`, `disconnected`, `expired` or `error`. Always last, exactly once |

Events arrive on the JS thread, in order. Types this version does not know are ignored.

Refusal codes include `consent_required`, `bad_token`, `bad_server`, `bad_config` and
`bad_rects`.

### Loading the native library

`$GAIADESK_EMBED_NATIVE_BINARY` (a path to a `.node` file), then a
`gaiadesk-embed.<platform>.node` beside this package, then the `@gaiadesk/embed-native-<platform>`
package. If none loads, the error says what was tried.

## Development

```sh
npm ci
npm test   # build, then the tests (a fake native binding)
GAIADESK_EMBED_NATIVE_BINARY=/path/to/gaiadesk-embed.darwin-arm64.node npm test   # + live tests
```

The live tests only check refusals the library makes before touching the network; they never
start a session. The example:

```sh
cd examples/electron-help-desk && npm install && GAIADESK_EMBED_TOKEN=gdemb_… npm start
```

It prints one JSON line per event; `GAIADESK_DEMO_AUTOSTART=1`, `GAIADESK_DEMO_GUIDED=1`,
`GAIADESK_SERVER` and (for automated tests only) `GAIADESK_DEMO_TEST_CONSENT=1` drive it, and
stdin `stop` / `pause` / `resume` control the session.

## Licences

- This package's TypeScript (the facade, the helpers and the example): **MIT** (`LICENSE`).
- The native library it loads (`gaiadesk-embed.<platform>.node`, from the
  `@gaiadesk/embed-native-<platform>` packages): closed source, under the **GaiaDesk Native Binary
  Licence** (`LICENSE-BINARY`).
