// Acme Desk: an Electron app with a "Get help" button.
//
//   GAIADESK_EMBED_TOKEN=gdemb_… [GAIADESK_SERVER=https://gaiadesk.net] npm start
//
// Your backend creates the support session (POST /v1/support/sessions with a
// secret key) and hands the app the embed token; here it comes from the
// environment or the text field. The red "card number" box is masked: your
// support team sees it painted black.
//
// GAIADESK_DEMO_GUIDED=1 allows guided input (the session must be "cobrowse").
// GAIADESK_DEMO_AUTOSTART=1 presses Get help at launch, and — for automated
// tests only — GAIADESK_DEMO_TEST_CONSENT=1 answers the consent dialog
// "Share" itself. Every event is printed to stdout as one JSON line; stdin
// "stop" ends the session, "pause"/"resume" pause guided input.
//
// The embed runs here, in the MAIN process.

import { app, BrowserWindow, dialog, ipcMain, screen } from 'electron';
import { join } from 'node:path';

import { EmbedError, GaiaDeskEmbed, frameSizeOf, maskRectsFromContent, windowIdOf } from '@gaiadesk/embed-native';
import type { EmbedEvent, Rect } from '@gaiadesk/embed-native';

const env = process.env;
const autostart = env.GAIADESK_DEMO_AUTOSTART === '1';

/** One JSON line on stdout, keys sorted (as the Swift demo prints them). */
function emit(obj: Record<string, unknown>): void {
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) sorted[k] = obj[k];
  process.stdout.write(JSON.stringify(sorted) + '\n');
}

let win: BrowserWindow | null = null;
let help: GaiaDeskEmbed | null = null;
let starting = false;
let layout: AcmeLayout | null = null;
let announced = false;
let clicks = 0;

function setStatus(text: string): void {
  win?.webContents.send('acme:status', text);
}

/** The window's display scale factor (used on Windows only). */
const scaleOf = (w: BrowserWindow): number => screen.getDisplayMatching(w.getBounds()).scaleFactor;

/** Page boxes → window-frame rects in the library's units. */
function frameRects(w: BrowserWindow, boxes: AcmeBox[]): Rect[] {
  return maskRectsFromContent(w, boxes, scaleOf(w));
}

const tuple = (r: Rect): number[] => [r.x, r.y, r.w, r.h];

function applyMasks(): void {
  if (!help || !win || !layout) return;
  try {
    help.setMaskedRects(frameRects(win, [layout.card]));
  } catch (e) {
    emit({ type: 'demo', mask_error: e instanceof EmbedError ? e.code : String(e) });
  }
}

function onLayout(w: BrowserWindow, next: AcmeLayout): void {
  layout = next;
  applyMasks();
  if (announced) return;
  announced = true;
  // Where things are, in the window frame's top-left space (tests sample the picture there).
  const [card, blue, buy] = frameRects(w, [next.card, next.blue, next.buy]).map(tuple);
  emit({
    type: 'demo',
    window: windowIdOf(w),
    pid: process.pid,
    build: GaiaDeskEmbed.buildInfoJson(),
    frame: frameSizeOf(w, scaleOf(w)),
    card,
    blue,
    buy,
  });
  if (autostart) setTimeout(() => void getHelp(''), 500);
}

/** The fallback consent dialog, where the library has none (Linux). */
async function askWithElectron(w: BrowserWindow, guided: boolean): Promise<boolean> {
  const { response } = await dialog.showMessageBox(w, {
    type: 'question',
    title: 'Get help from Acme',
    message: 'Share this window with Acme support?',
    detail: guided
      ? 'Acme support will see this window, not the rest of your screen, and can click and type in this app while it is in front. You can pause their control or stop sharing at any time.'
      : 'Acme support will see this window, not the rest of your screen. They cannot click or type. You can stop sharing at any time.',
    buttons: ['Share', "Don't share"],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  });
  return response === 0;
}

async function getHelp(fieldToken: string): Promise<void> {
  const w = win;
  if (!w || help || starting) return;
  starting = true;
  try {
    const guided = env.GAIADESK_DEMO_GUIDED === '1';
    let agreed: boolean;
    if (env.GAIADESK_DEMO_TEST_CONSENT === '1') {
      agreed = true; // automated tests only: never ship this
    } else {
      let native: boolean | null = null;
      try {
        native = GaiaDeskEmbed.requestConsent('Acme', 'window', guided);
      } catch {
        native = null;
      }
      agreed = native ?? (await askWithElectron(w, guided));
    }
    if (!agreed) {
      setStatus('Not shared.');
      emit({ type: 'demo', consent: false });
      return;
    }
    try {
      help = GaiaDeskEmbed.start(
        {
          embedToken: (env.GAIADESK_EMBED_TOKEN ?? fieldToken).trim(),
          company: 'Acme',
          windowId: windowIdOf(w),
          guided,
          ...(env.GAIADESK_SERVER ? { server: env.GAIADESK_SERVER } : {}),
        },
        { consentGranted: true },
        onEvent,
      );
      applyMasks();
    } catch (e) {
      const err = EmbedError.from(e);
      setStatus(`Could not start: ${err.message}`);
      emit({ type: 'demo', start_error: err.code });
    }
  } finally {
    starting = false;
  }
}

function onEvent(e: EmbedEvent): void {
  switch (e.type) {
    case 'code':
      setStatus(`Support code ${e.code} — read it to the Acme agent.`);
      emit({ type: 'code', code: e.code, session_id: e.sessionId, mode: e.mode });
      break;
    case 'joined':
      setStatus(`${e.agent ?? 'An agent'} is viewing this window.`);
      emit({ type: 'joined', agent: e.agent });
      break;
    case 'left':
      emit({ type: 'left' });
      break;
    case 'state':
      emit({ type: 'state', state: e.state });
      break;
    case 'control':
      emit({ type: 'control', allowed: e.allowed });
      break;
    case 'action':
      emit({ type: 'action', action: e.action, applied: e.applied, reason: e.reason });
      break;
    case 'error':
      emit({ type: 'error', code: e.code, message: e.message });
      break;
    case 'ended':
      setStatus(`Sharing ended (${e.reason}).`);
      help = null;
      emit({ type: 'ended', reason: e.reason });
      if (autostart) setTimeout(() => app.quit(), 300);
      break;
  }
}

function createWindow(): BrowserWindow {
  const w = new BrowserWindow({
    width: 640,
    height: 400,
    useContentSize: true,
    title: 'Acme Desk',
    backgroundColor: '#34c759',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  // The display (and so the scale factor) can change with the window.
  w.on('resize', applyMasks);
  w.on('moved', applyMasks);
  w.on('closed', () => {
    win = null;
  });
  void w.loadFile(join(__dirname, '..', 'index.html'));
  return w;
}

ipcMain.handle('acme:initial-token', () => env.GAIADESK_EMBED_TOKEN ?? '');
ipcMain.on('acme:layout', (e, next: AcmeLayout) => {
  if (win && e.sender === win.webContents) onLayout(win, next);
});
ipcMain.on('acme:get-help', (_e, token: string) => void getHelp(String(token)));
ipcMain.handle('acme:buy', () => {
  clicks += 1;
  emit({ type: 'demo', bought: clicks });
  return clicks;
});

// stdin "stop" ends the session, "pause"/"resume" pause guided input (tests).
process.stdin.setEncoding('utf8');
process.stdin.on('data', (text: string) => {
  if (text.includes('pause')) help?.setPaused(true);
  if (text.includes('resume')) help?.setPaused(false);
  if (text.includes('stop')) help?.stop();
});
process.stdin.on('error', () => undefined);

app.whenReady().then(() => {
  win = createWindow();
});
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => help?.stop());
