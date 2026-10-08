// The page's only way to the main process (contextIsolation + sandbox): a
// few named calls, nothing else of Node or Electron.

import { contextBridge, ipcRenderer, webFrame } from 'electron';

const zoomed = (b: AcmeBox, z: number): AcmeBox => ({ x: b.x * z, y: b.y * z, width: b.width * z, height: b.height * z });

const bridge: AcmeBridge = {
  initialToken: () => ipcRenderer.invoke('acme:initial-token') as Promise<string>,
  layout: (r) => {
    // getBoundingClientRect is in CSS pixels; the window is in DIPs.
    const z = webFrame.getZoomFactor();
    ipcRenderer.send('acme:layout', { card: zoomed(r.card, z), blue: zoomed(r.blue, z), buy: zoomed(r.buy, z) } satisfies AcmeLayout);
  },
  getHelp: (token) => ipcRenderer.send('acme:get-help', String(token)),
  buy: () => ipcRenderer.invoke('acme:buy') as Promise<number>,
  onStatus: (listener) => {
    ipcRenderer.on('acme:status', (_e, text: unknown) => listener(String(text)));
  },
};

contextBridge.exposeInMainWorld('acme', bridge);
