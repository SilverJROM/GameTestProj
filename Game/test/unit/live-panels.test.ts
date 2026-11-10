// Open Bag and the forge stay painted from the latest fig numbers.
// A snapshot must change "Experience" and "Coins" without closing the sheet,
// and a thinner purse must change the forge line and which buttons can be pressed.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { viewBox } from '../../src/client/camera';
import { sproutAfterLogin } from '../../src/client/main';
import { HEALTH_BAR_H, HEALTH_X, HEALTH_Y, townControls } from '../../src/client/view';
import { townSpawn } from '../../src/rules/regions';
import { ZOOM_CLOSE } from '../../src/rules/tables';

const pageHtml = readFileSync(new URL('../../src/client/index.html', import.meta.url), 'utf8');

interface FakeEl {
  id: string;
  hidden: boolean;
  value: string;
  width: number;
  height: number;
  disabled: boolean;
  type: string;
  writes: number;
  listeners: Record<string, Array<(event: FakeEvent) => void>>;
  parent: FakeEl | null;
  children: FakeEl[];
  addEventListener(type: string, listener: (event: FakeEvent) => void): void;
  appendChild(child: FakeEl): void;
  getContext(): unknown;
  getBoundingClientRect(): { left: number; top: number; width: number; height: number };
  textContent: string;
}

interface FakeEvent {
  button?: number;
  clientX?: number;
  clientY?: number;
  key?: string;
  target?: unknown;
  stopped: boolean;
  preventDefault(): void;
  stopPropagation(): void;
}

interface PaintMark {
  text: string;
  x: number;
  y: number;
}

function fakeEl(id: string): FakeEl {
  const children: FakeEl[] = [];
  let text = '';
  const el: FakeEl = {
    id,
    hidden: false,
    value: '',
    width: 1280,
    height: 720,
    disabled: false,
    type: '',
    writes: 0,
    listeners: {},
    parent: null,
    children,
    addEventListener(type, listener) {
      (el.listeners[type] ??= []).push(listener);
    },
    appendChild(child) {
      child.parent = el;
      children.push(child);
    },
    getContext() {
      return null;
    },
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 1280, height: 720 };
    },
    get textContent() {
      return text;
    },
    set textContent(value: string) {
      el.writes += 1;
      text = String(value);
      children.length = 0;
    },
  };
  return el;
}

function press(canvas: FakeEl, x: number, y: number): void {
  const event: FakeEvent = {
    button: 0,
    clientX: x,
    clientY: y,
    target: canvas,
    stopped: false,
    preventDefault() {},
    stopPropagation() {
      event.stopped = true;
    },
  };
  for (const listener of canvas.listeners.mousedown ?? []) listener(event);
}

function click(el: FakeEl): void {
  const event: FakeEvent = {
    button: 0,
    target: el,
    stopped: false,
    preventDefault() {},
    stopPropagation() {
      event.stopped = true;
    },
  };
  for (const listener of el.listeners.click ?? []) listener(event);
}

class FakeSocket {
  static open: FakeSocket | null = null;
  listeners: Record<string, Array<(event: { data?: unknown }) => void>> = {};
  sent: string[] = [];

  constructor(_url: string) {
    FakeSocket.open = this;
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {}

  addEventListener(type: string, listener: (event: { data?: unknown }) => void): void {
    (this.listeners[type] ??= []).push(listener);
  }
}

function deliver(message: unknown): void {
  const sock = FakeSocket.open;
  if (sock === null) throw new Error('no lemon socket');
  const data = JSON.stringify(message);
  for (const listener of sock.listeners.message ?? []) listener({ data });
}

function figSnapshot(character: Record<string, unknown>): unknown {
  return {
    type: 'snapshot',
    character: { id: 'fig-self', place: 'town', gender: 'woman', ...character },
    snapshot: { players: [], monsters: [], coins: [], pickups: [] },
  };
}

function buttonState(buttons: readonly FakeEl[]): Array<{ text: string; disabled: boolean }> {
  return buttons.map((button) => ({ text: button.textContent, disabled: button.disabled }));
}

describe('panel close markup', () => {
  it('puts a Close button on the bag and the blacksmith', () => {
    for (const id of ['olive-close', 'quince-close']) {
      const sectionId = id === 'olive-close' ? 'olive-sheet' : 'quince-smith';
      const start = pageHtml.indexOf(`id="${sectionId}"`);
      const next = pageHtml.indexOf('<section', start + 1);
      const section = pageHtml.slice(start, next === -1 ? undefined : next);
      expect(section).toContain(`<button type="button" id="${id}">Close</button>`);
    }
  });
});

describe('live bag and blacksmith panels', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    FakeSocket.open = null;
  });

  it('updates an open Bag and an open shop from the next snapshot without closing them', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {},
    });

    const painted: PaintMark[] = [];
    const canvas = fakeEl('papaya-canvas');
    canvas.getContext = () => ({
      fillStyle: '',
      font: '',
      shadowColor: '',
      shadowBlur: 0,
      clearRect() {},
      fillRect() {},
      fillText(text: string, x: number, y: number) {
        painted.push({ text, x, y });
      },
      save() {},
      restore() {},
      translate() {},
      scale() {},
      drawImage() {},
      beginPath() {},
      ellipse() {},
      fill() {},
      createRadialGradient() {
        return { addColorStop() {} };
      },
    });

    const sheet = fakeEl('olive-sheet');
    const smith = fakeEl('quince-smith');
    sheet.hidden = true;
    smith.hidden = true;
    const xp = fakeEl('olive-xp');
    const coins = fakeEl('olive-coins');
    const sword = fakeEl('olive-sword');
    const purse = fakeEl('quince-purse');
    const list = fakeEl('quince-list');
    const oliveClose = fakeEl('olive-close');
    const quinceClose = fakeEl('quince-close');

    const elements = new Map<string, FakeEl>([
      ['papaya-canvas', canvas],
      ['olive-sheet', sheet],
      ['olive-close', oliveClose],
      ['olive-coins', coins],
      ['olive-level', fakeEl('olive-level')],
      ['olive-health', fakeEl('olive-health')],
      ['olive-strike', fakeEl('olive-strike')],
      ['olive-xp', xp],
      ['olive-sword', sword],
      ['olive-armor', fakeEl('olive-armor')],
      ['quince-smith', smith],
      ['quince-close', quinceClose],
      ['quince-purse', purse],
      ['quince-list', list],
      ['plum-duel', fakeEl('plum-duel')],
      ['plum-offer', fakeEl('plum-offer')],
      ['plum-accept', fakeEl('plum-accept')],
      ['plum-decline', fakeEl('plum-decline')],
      ['kiwi-zoom', fakeEl('kiwi-zoom')],
      ['zoom-slider', fakeEl('zoom-slider')],
    ]);
    const docListeners: Record<string, Array<(event: FakeEvent) => void>> = {};
    const doc = {
      getElementById: (id: string) => elements.get(id) ?? null,
      createElement: (tag: string) => fakeEl(tag),
      addEventListener(type: string, listener: (event: FakeEvent) => void) {
        (docListeners[type] ??= []).push(listener);
      },
    };

    vi.stubGlobal('window', {});
    vi.stubGlobal('document', doc);
    vi.stubGlobal('WebSocket', FakeSocket);
    vi.stubGlobal('location', { protocol: 'http:', host: '127.0.0.1:8787' });

    sproutAfterLogin(doc as unknown as Document, { id: 'fig-self', place: 'town', gender: 'woman' });

    const controls = townControls(viewBox('town', townSpawn[0], townSpawn[1], ZOOM_CLOSE));
    const bag = controls.find((row) => row.id === 'bag');
    const bubble = controls.find((row) => row.id === 'bubble');
    expect(bag).toBeDefined();
    expect(bubble).toBeDefined();

    const rich = {
      level: 1,
      xp: 2,
      hp: 70,
      maxHp: 70,
      coins: 200,
      sword: null,
      armor: null,
    };

    press(canvas, bag!.x + 4, bag!.y + 4);
    expect(sheet.hidden).toBe(false);
    expect(xp.textContent).toBe('Experience 0 / 10');
    expect(coins.textContent).toBe('Coins: 0');
    expect(sword.textContent).toBe('Nothing worn');

    deliver(figSnapshot(rich));

    expect(sheet.hidden).toBe(false);
    expect(xp.textContent).toBe('Experience 2 / 10');
    expect(coins.textContent).toBe('Coins: 200');
    const xpWrites = xp.writes;
    const coinWrites = coins.writes;
    const swordWrites = sword.writes;
    deliver(figSnapshot(rich));
    expect(xp.writes).toBe(xpWrites);
    expect(coins.writes).toBe(coinWrites);
    expect(sword.writes).toBe(swordWrites);
    expect(xp.textContent).toBe('Experience 2 / 10');

    const lv = painted.filter((mark) => mark.text === 'Lv 1');
    const xpLine = painted.filter((mark) => mark.text === 'XP 2 / 10');
    const coinLine = painted.filter((mark) => mark.text === 'Coins 200');
    expect(lv.length).toBeGreaterThan(0);
    expect(xpLine.length).toBeGreaterThan(0);
    expect(coinLine.length).toBeGreaterThan(0);
    expect(lv[0]?.x).toBe(HEALTH_X);
    expect(lv[0]!.y).toBeGreaterThan(HEALTH_Y + HEALTH_BAR_H);
    expect(xpLine[0]?.x).toBe(HEALTH_X);
    expect(xpLine[0]!.y).toBeGreaterThan(lv[0]!.y);
    expect(coinLine[0]?.x).toBe(HEALTH_X);
    expect(coinLine[0]!.y).toBeGreaterThan(xpLine[0]!.y);

    press(canvas, bubble!.x + 4, bubble!.y + 4);
    expect(smith.hidden).toBe(false);
    expect(sheet.hidden).toBe(true);
    expect(purse.textContent).toBe('Your coins: 200');
    expect(buttonState(list.children)).toEqual([
      { text: 'Short sword (18)', disabled: false },
      { text: 'Long sword (40)', disabled: false },
      { text: 'Great sword (70)', disabled: false },
      { text: 'Leather (16)', disabled: false },
      { text: 'Chain (36)', disabled: false },
      { text: 'Plate (64)', disabled: false },
    ]);
    const keptButtons = [...list.children];
    const listWrites = list.writes;

    deliver(figSnapshot({ ...rich, coins: 100 }));
    expect(smith.hidden).toBe(false);
    expect(purse.textContent).toBe('Your coins: 100');
    expect(list.writes).toBe(listWrites);
    expect(list.children[0]).toBe(keptButtons[0]);
    expect(list.children[5]).toBe(keptButtons[5]);
    expect(buttonState(list.children)[0]).toEqual({ text: 'Short sword (18)', disabled: false });

    deliver(figSnapshot({ ...rich, coins: 30 }));
    expect(smith.hidden).toBe(false);
    expect(purse.textContent).toBe('Your coins: 30');
    expect(list.writes).toBe(listWrites + 1);
    expect(list.children[0]).not.toBe(keptButtons[0]);
    expect(buttonState(list.children)).toEqual([
      { text: 'Short sword (18)', disabled: false },
      { text: 'Long sword (Need 40 coins)', disabled: true },
      { text: 'Great sword (Need 70 coins)', disabled: true },
      { text: 'Leather (16)', disabled: false },
      { text: 'Chain (Need 36 coins)', disabled: true },
      { text: 'Plate (Need 64 coins)', disabled: true },
    ]);
    const rebuilt = [...list.children];
    const purseWrites = purse.writes;
    deliver(figSnapshot({ ...rich, coins: 30 }));
    expect(purse.writes).toBe(purseWrites);
    expect(list.writes).toBe(listWrites + 1);
    expect(list.children[0]).toBe(rebuilt[0]);
    expect(list.children[1]).toBe(rebuilt[1]);

    click(list.children[0]!);
    expect(smith.hidden).toBe(true);
    const bought = JSON.parse(FakeSocket.open?.sent.at(-1) ?? 'null') as { type: string; item: string };
    expect(bought).toEqual({ type: 'buy', item: 'shortSword' });
    expect(purse.textContent).toBe('Your coins: 30');

    deliver(figSnapshot({ ...rich, coins: 200 }));
    expect(purse.textContent).toBe('Your coins: 30');
    press(canvas, bubble!.x + 4, bubble!.y + 4);
    expect(smith.hidden).toBe(false);
    expect(purse.textContent).toBe('Your coins: 200');
    expect(list.children.every((button) => button.disabled === false)).toBe(true);

    const key = (name: string): void => {
      const event: FakeEvent = {
        key: name,
        stopped: false,
        preventDefault() {},
        stopPropagation() {
          event.stopped = true;
        },
      };
      for (const listener of docListeners.keydown ?? []) listener(event);
    };
    key('Escape');
    expect(smith.hidden).toBe(true);
    expect(sheet.hidden).toBe(true);

    press(canvas, bag!.x + 4, bag!.y + 4);
    expect(sheet.hidden).toBe(false);
    expect(xp.textContent).toBe('Experience 2 / 10');
    expect(coins.textContent).toBe('Coins: 200');
    press(canvas, bag!.x + 4, bag!.y + 4);
    expect(sheet.hidden).toBe(true);
    deliver(figSnapshot({ ...rich, xp: 9, coins: 1 }));
    expect(xp.textContent).toBe('Experience 2 / 10');
    expect(coins.textContent).toBe('Coins: 200');

    press(canvas, bag!.x + 4, bag!.y + 4);
    expect(sheet.hidden).toBe(false);
    expect(xp.textContent).toBe('Experience 9 / 10');
    expect(coins.textContent).toBe('Coins: 1');
    click(oliveClose);
    expect(sheet.hidden).toBe(true);

    press(canvas, bubble!.x + 4, bubble!.y + 4);
    expect(smith.hidden).toBe(false);
    expect(purse.textContent).toBe('Your coins: 1');
    click(quinceClose);
    expect(smith.hidden).toBe(true);
    key('Escape');
    expect(smith.hidden).toBe(true);
    expect(sheet.hidden).toBe(true);
  });
});
