// The page: a plain script (no imports), talking only to window.acme.

{
  const byId = <T extends HTMLElement>(id: string): T => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`#${id} is missing`);
    return el as T;
  };

  const card = byId('card');
  const blue = byId('blue');
  const buy = byId<HTMLButtonElement>('buy');
  const clicks = byId('clicks');
  const token = byId<HTMLInputElement>('token');
  const help = byId<HTMLButtonElement>('get-help');
  const status = byId('status');

  const box = (el: HTMLElement): AcmeBox => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  };
  const report = (): void => window.acme.layout({ card: box(card), blue: box(blue), buy: box(buy) });

  buy.addEventListener('click', () => {
    void window.acme.buy().then((n) => {
      clicks.textContent = `Buy clicked ${n} times`;
    });
  });
  help.addEventListener('click', () => window.acme.getHelp(token.value));
  window.acme.onStatus((text) => {
    status.textContent = text;
  });
  // Masks follow the layout: report it now and whenever it can move.
  window.addEventListener('resize', report);
  void window.acme.initialToken().then((t) => {
    token.value = t;
    report();
  });
}
