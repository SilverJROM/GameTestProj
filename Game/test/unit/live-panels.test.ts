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
  className: string;
  tagName: string;
  src: string;
  draggable: boolean;
  dataset: Record<string, string>;
  writes: number;
  listeners: Record<string, Array<(event: FakeEvent) => void>>;
  parent: FakeEl | null;
  children: FakeEl[];
  addEventListener(type: string, listener: (event: FakeEvent) => void): void;
  appendChild(child: FakeEl): void;
  replaceChild(next: FakeEl, prev: FakeEl): void;
  removeChild(child: FakeEl): void;
  getContext(): unknown;
  getBoundingClientRect(): { left: number; top: number; width: number; height: number };
  textContent: string;
}

interface FakeTransfer {
  effectAllowed: string;
  dropEffect: string;
  setData(type: string, value: string): void;
  getData(type: string): string;
}

interface FakeEvent {
  button?: number;
  clientX?: number;
  clientY?: number;
  key?: string;
  target?: unknown;
  stopped: boolean;
  defaultPrevented: boolean;
  dataTransfer?: FakeTransfer;
  preventDefault(): void;
  stopPropagation(): void;
}

interface PaintMark {
  text: string;
  x: number;
  y: number;
  font: string;
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
    className: '',
    tagName: id.toUpperCase(),
    src: '',
    draggable: false,
    dataset: {},
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
    replaceChild(next, prev) {
      const index = children.indexOf(prev);
      if (index < 0) throw new Error('missing fig child');
      prev.parent = null;
      next.parent = el;
      children[index] = next;
    },
    removeChild(child) {
      const index = children.indexOf(child);
      if (index >= 0) children.splice(index, 1);
      child.parent = null;
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
    defaultPrevented: false,
    preventDefault() {
      event.defaultPrevented = true;
    },
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
    defaultPrevented: false,
    preventDefault() {
      event.defaultPrevented = true;
    },
    stopPropagation() {
      event.stopped = true;
    },
  };
  for (const listener of el.listeners.click ?? []) listener(event);
}

function grapeTransfer(): FakeTransfer {
  const store = new Map<string, string>();
  return {
    effectAllowed: '',
    dropEffect: '',
    setData(type, value) {
      store.set(type, value);
    },
    getData(type) {
      return store.get(type) ?? '';
    },
  };
}

function fireDrag(el: FakeEl, type: string, transfer: FakeTransfer): FakeEvent {
  const event: FakeEvent = {
    target: el,
    stopped: false,
    defaultPrevented: false,
    dataTransfer: transfer,
    preventDefault() {
      event.defaultPrevented = true;
    },
    stopPropagation() {
      event.stopped = true;
    },
  };
  for (const listener of el.listeners[type] ?? []) listener(event);
  return event;
}

function fieldNode(root: FakeEl, field: string): FakeEl {
  const walk = (node: FakeEl): FakeEl | null => {
    if (node.dataset.field === field) return node;
    for (const child of node.children) {
      const found = walk(child);
      if (found !== null) return found;
    }
    return null;
  };
  const found = walk(root);
  if (found === null) throw new Error(`missing ${field}`);
  return found;
}

function fieldText(root: FakeEl, field: string): string {
  return fieldNode(root, field).textContent;
}

function point(el: FakeEl): void {
  const event: FakeEvent = {
    target: el,
    stopped: false,
    defaultPrevented: false,
    preventDefault() {
      event.defaultPrevented = true;
    },
    stopPropagation() {
      event.stopped = true;
    },
  };
  for (const type of ['pointerdown', 'mousedown']) {
    for (const listener of el.listeners[type] ?? []) listener(event);
  }
}

function grapeFace(tile: FakeEl): { name: string; bonus: string; worn: boolean; seal: string } {
  const named = (className: string) => tile.children.find((child) => child.className === className);
  return {
    name: named('nm')?.textContent ?? '',
    bonus: named('bn')?.textContent ?? '',
    worn: tile.className.split(' ').includes('worn'),
    seal: named('seal')?.textContent ?? '',
  };
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

function shopRows(list: FakeEl): FakeEl[] {
  return list.children.filter((child) => child.className === 'row');
}

function actionOf(row: FakeEl): FakeEl {
  const action = row.children[row.children.length - 1];
  if (action === undefined) throw new Error('quince row has no action');
  return action;
}

function rowState(row: FakeEl): { name: string; effect: string; price: string; action: string; disabled: boolean; className: string; tag: string } {
  const named = (className: string): FakeEl => {
    const found = row.children.find((child) => child.className === className);
    if (found === undefined) throw new Error(`missing ${className}`);
    return found;
  };
  const action = actionOf(row);
  return {
    name: named('name').textContent,
    effect: named('effect').textContent,
    price: named('price').textContent,
    action: action.textContent,
    disabled: action.disabled,
    className: action.className,
    tag: action.tagName,
  };
}

describe('panel close markup', () => {
  it('puts a Close button on the bag and the blacksmith', () => {
    const oliveStart = pageHtml.indexOf('id="olive-sheet"');
    const oliveNext = pageHtml.indexOf('<section', oliveStart + 1);
    const olive = pageHtml.slice(oliveStart, oliveNext === -1 ? undefined : oliveNext);
    expect(olive).toMatch(/<button type="button" id="olive-close"[^>]*>Close<\/button>/);
    expect(olive).toContain('<h3>Inventory</h3>');
    expect(olive).toContain('id="olive-items"');
    expect(olive).toContain('Drag an item onto its slot to equip it.');

    const smithStart = pageHtml.indexOf('id="quince-smith"');
    const smithNext = pageHtml.indexOf('<section', smithStart + 1);
    const smith = pageHtml.slice(smithStart, smithNext === -1 ? undefined : smithNext);
    expect(smith).toContain('<h3>Blacksmith</h3>');
    expect(smith).toMatch(/<button type="button" id="quince-close"[^>]*>Close<\/button>/);
    expect(smith).toContain('id="quince-purse"');
    expect(smith).toContain('Buying puts the item in your bag. Equip it from the Bag.');
  });

  it('centers the blacksmith panel and copies the shop mockup colors', () => {
    const ruleStart = pageHtml.indexOf('#quince-smith {');
    const ruleEnd = pageHtml.indexOf('#quince-smith .top');
    const rule = pageHtml.slice(ruleStart, ruleEnd);
    expect(rule).toContain('position: fixed');
    expect(rule).toContain('left: 50%');
    expect(rule).toContain('top: 50%');
    expect(rule).toContain('translate(-50%, -50%)');
    expect(rule).toContain('min(860px, 94vw)');
    expect(rule).toContain('max-height: 94vh');
    expect(rule).toContain('overflow: auto');
    expect(rule).not.toContain('right: 1rem');
    expect(pageHtml).toContain('background: #221c16');
    expect(pageHtml).toContain('border: 2px solid #6b5433');
    expect(pageHtml).toContain('color: #f2c200');
    expect(pageHtml).toContain('background: #2d8a3e');
    expect(pageHtml).toContain('background: #4a4036');
    expect(pageHtml).toContain('color: #8a7e70');
    const corner = pageHtml.slice(pageHtml.indexOf('#plum-duel {'), pageHtml.indexOf('#plum-duel button'));
    expect(corner).toContain('top: 1rem');
    expect(corner).toContain('right: 1rem');
    expect(corner).not.toContain('#olive-sheet');
  });

  it('centers the bag and keeps it off the zoom slider', () => {
    const ruleStart = pageHtml.indexOf('#olive-sheet {');
    const ruleEnd = pageHtml.indexOf('#olive-sheet .top');
    const rule = pageHtml.slice(ruleStart, ruleEnd);
    expect(rule).toContain('position: fixed');
    expect(rule).toContain('left: 50%');
    expect(rule).toContain('top: 50%');
    expect(rule).toContain('translate(-50%, -50%)');
    expect(rule).toContain('min(860px, 94vw)');
    expect(rule).toContain('max-height: 94vh');
    expect(rule).toContain('overflow: auto');
    expect(rule).not.toContain('right: 1rem');
    expect(pageHtml).toContain('background: #16130f');
    expect(pageHtml).toContain('border-color: #e6c36a');
    expect(pageHtml).toContain('.slot.peach');
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
    let ink = '';
    const canvas = fakeEl('papaya-canvas');
    canvas.getContext = () => ({
      fillStyle: '',
      get font() {
        return ink;
      },
      set font(value: string) {
        ink = value;
      },
      shadowColor: '',
      shadowBlur: 0,
      clearRect() {},
      fillRect() {},
      fillText(text: string, x: number, y: number) {
        painted.push({ text, x, y, font: ink });
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
      ['olive-items', fakeEl('olive-items')],
      ['olive-hint', fakeEl('olive-hint')],
      ['olive-fig', fakeEl('olive-fig')],
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
    expect(xp.textContent).toBe('0 / 10');
    expect(coins.textContent).toBe('Coins: 0');
    expect(fieldText(sword, 'name')).toBe('Nothing worn');
    expect((elements.get('olive-fig') as FakeEl).src).toBe('/avatars/warrior-f/stand.png');

    deliver(figSnapshot(rich));

    expect(sheet.hidden).toBe(false);
    expect(xp.textContent).toBe('2 / 10');
    expect(coins.textContent).toBe('Coins: 200');
    const xpWrites = xp.writes;
    const coinWrites = coins.writes;
    const swordWrites = sword.writes;
    deliver(figSnapshot(rich));
    expect(xp.writes).toBe(xpWrites);
    expect(coins.writes).toBe(coinWrites);
    expect(sword.writes).toBe(swordWrites);
    expect(xp.textContent).toBe('2 / 10');

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
    const bubbleInk = painted.filter((mark) => mark.text === 'Armor and weapons');
    expect(bubbleInk.length).toBeGreaterThan(0);
    expect(bubbleInk[0]!.font).toContain('14px');
    expect(bubble!.width).toBe(156);
    expect(bubble!.height).toBe(42);

    press(canvas, bubble!.x + 4, bubble!.y + 4);
    expect(smith.hidden).toBe(false);
    expect(sheet.hidden).toBe(true);
    expect(purse.textContent).toBe('Your coins: 200');
    expect(list.children.map((child) => child.textContent).filter((text) => text === 'Weapons' || text === 'Armor')).toEqual([
      'Weapons',
      'Armor',
    ]);
    expect(shopRows(list).map(rowState)).toEqual([
      { name: 'Short sword', effect: 'Strike +2', price: '18', action: 'Buy', disabled: false, className: 'buy', tag: 'BUTTON' },
      { name: 'Long sword', effect: 'Strike +4', price: '40', action: 'Buy', disabled: false, className: 'buy', tag: 'BUTTON' },
      { name: 'Great sword', effect: 'Strike +7', price: '70', action: 'Buy', disabled: false, className: 'buy', tag: 'BUTTON' },
      { name: 'Leather', effect: 'Max HP +12', price: '16', action: 'Buy', disabled: false, className: 'buy', tag: 'BUTTON' },
      { name: 'Chain', effect: 'Max HP +24', price: '36', action: 'Buy', disabled: false, className: 'buy', tag: 'BUTTON' },
      { name: 'Plate', effect: 'Max HP +40', price: '64', action: 'Buy', disabled: false, className: 'buy', tag: 'BUTTON' },
    ]);
    const keptRows = shopRows(list);
    const keptActions = keptRows.map(actionOf);
    const listWrites = list.writes;
    expect(listWrites).toBe(0);

    deliver(figSnapshot({ ...rich, coins: 100 }));
    expect(smith.hidden).toBe(false);
    expect(purse.textContent).toBe('Your coins: 100');
    expect(list.writes).toBe(listWrites);
    expect(shopRows(list)[0]).toBe(keptRows[0]);
    expect(shopRows(list)[5]).toBe(keptRows[5]);
    expect(actionOf(shopRows(list)[0]!)).toBe(keptActions[0]);
    expect(rowState(shopRows(list)[0]!).action).toBe('Buy');

    deliver(figSnapshot({ ...rich, coins: 30 }));
    expect(smith.hidden).toBe(false);
    expect(purse.textContent).toBe('Your coins: 30');
    expect(list.writes).toBe(listWrites);
    expect(shopRows(list)[0]).toBe(keptRows[0]);
    expect(actionOf(shopRows(list)[0]!)).toBe(keptActions[0]);
    expect(actionOf(shopRows(list)[1]!)).toBe(keptActions[1]);
    expect(shopRows(list).map(rowState).map((row) => ({ action: row.action, disabled: row.disabled, className: row.className }))).toEqual([
      { action: 'Buy', disabled: false, className: 'buy' },
      { action: 'Need 40 coins', disabled: true, className: 'buy no' },
      { action: 'Need 70 coins', disabled: true, className: 'buy no' },
      { action: 'Buy', disabled: false, className: 'buy' },
      { action: 'Need 36 coins', disabled: true, className: 'buy no' },
      { action: 'Need 64 coins', disabled: true, className: 'buy no' },
    ]);
    const purseWrites = purse.writes;
    const shortWrites = actionOf(shopRows(list)[0]!).writes;
    const longWrites = actionOf(shopRows(list)[1]!).writes;
    deliver(figSnapshot({ ...rich, coins: 30 }));
    expect(purse.writes).toBe(purseWrites);
    expect(list.writes).toBe(listWrites);
    expect(actionOf(shopRows(list)[0]!).writes).toBe(shortWrites);
    expect(actionOf(shopRows(list)[1]!).writes).toBe(longWrites);
    expect(shopRows(list)[1]).toBe(keptRows[1]);

    click(actionOf(shopRows(list)[0]!));
    expect(smith.hidden).toBe(false);
    const bought = JSON.parse(FakeSocket.open?.sent.at(-1) ?? 'null') as { type: string; item: string };
    expect(bought).toEqual({ type: 'buy', item: 'shortSword' });
    expect(purse.textContent).toBe('Your coins: 30');

    const leatherAction = actionOf(shopRows(list)[3]!);
    deliver(figSnapshot({ ...rich, coins: 12, items: ['shortSword'] }));
    expect(smith.hidden).toBe(false);
    expect(purse.textContent).toBe('Your coins: 12');
    expect(shopRows(list)[0]).toBe(keptRows[0]);
    expect(actionOf(shopRows(list)[0]!).textContent).toBe('Owned');
    expect(actionOf(shopRows(list)[0]!).tagName).toBe('SPAN');
    expect(actionOf(shopRows(list)[0]!).className).toBe('buy own');
    expect(actionOf(shopRows(list)[3]!)).toBe(leatherAction);
    expect(rowState(shopRows(list)[3]!)).toMatchObject({ action: 'Need 16 coins', disabled: true, className: 'buy no' });
    const sentAfterBuy = FakeSocket.open?.sent.length ?? 0;
    click(actionOf(shopRows(list)[0]!));
    click(leatherAction);
    expect(FakeSocket.open?.sent.length).toBe(sentAfterBuy);
    expect(smith.hidden).toBe(false);

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
    deliver(figSnapshot({ ...rich, items: [] }));

    press(canvas, bag!.x + 4, bag!.y + 4);
    expect(sheet.hidden).toBe(false);
    expect(xp.textContent).toBe('2 / 10');
    expect(coins.textContent).toBe('Coins: 200');
    press(canvas, bag!.x + 4, bag!.y + 4);
    expect(sheet.hidden).toBe(true);
    deliver(figSnapshot({ ...rich, xp: 9, coins: 1 }));
    expect(xp.textContent).toBe('2 / 10');
    expect(coins.textContent).toBe('Coins: 200');

    press(canvas, bag!.x + 4, bag!.y + 4);
    expect(sheet.hidden).toBe(false);
    expect(xp.textContent).toBe('9 / 10');
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

    const owned = {
      level: 1,
      xp: 0,
      hp: 40,
      maxHp: 70,
      coins: 200,
      sword: null,
      armor: null,
      items: ['shortSword', 'leather'],
    };
    deliver(figSnapshot(owned));
    press(canvas, bubble!.x + 4, bubble!.y + 4);
    expect(smith.hidden).toBe(false);
    expect(list.children.filter((child) => child.tagName === 'H4').map((child) => child.textContent)).toEqual([
      'Weapons',
      'Armor',
    ]);
    expect(shopRows(list).map((row) => rowState(row).action)).toEqual([
      'Owned',
      'Buy',
      'Buy',
      'Owned',
      'Buy',
      'Buy',
    ]);
    expect(actionOf(shopRows(list)[0]!).tagName).toBe('SPAN');
    expect(actionOf(shopRows(list)[3]!).tagName).toBe('SPAN');
    const sentBeforeOwned = FakeSocket.open?.sent.length ?? 0;
    click(actionOf(shopRows(list)[0]!));
    click(actionOf(shopRows(list)[3]!));
    expect(FakeSocket.open?.sent.length).toBe(sentBeforeOwned);
    expect(smith.hidden).toBe(false);

    click(actionOf(shopRows(list)[1]!));
    expect(smith.hidden).toBe(false);
    expect(JSON.parse(FakeSocket.open?.sent.at(-1) ?? 'null')).toEqual({ type: 'buy', item: 'longSword' });

    press(canvas, bag!.x + 4, bag!.y + 4);
    expect(sheet.hidden).toBe(false);
    const itemHost = elements.get('olive-items');
    if (itemHost === undefined) {
      throw new Error('olive-items missing');
    }
    const shortTile = itemHost.children[0];
    const leatherTile = itemHost.children[1];
    if (shortTile === undefined || leatherTile === undefined) throw new Error('olive grapes missing');
    expect(grapeFace(shortTile)).toEqual({ name: 'Short sword', bonus: '+2 strike', worn: false, seal: '' });
    expect(grapeFace(leatherTile)).toEqual({ name: 'Leather', bonus: '+12 max HP', worn: false, seal: '' });
    const health = elements.get('olive-health')!;
    const strikeLine = elements.get('olive-strike')!;
    const armorLine = elements.get('olive-armor')!;
    const hint = elements.get('olive-hint');
    if (health === undefined || strikeLine === undefined || armorLine === undefined || hint === undefined) {
      throw new Error('bag lines missing');
    }
    expect(fieldText(sword, 'name')).toBe('Nothing worn');
    expect(fieldText(sword, 'bonus')).toBe('');
    expect(fieldText(armorLine, 'name')).toBe('Nothing worn');
    expect(fieldText(armorLine, 'bonus')).toBe('');
    expect(strikeLine.textContent).toBe('4');
    expect(health.textContent).toBe('40 / 70');

    click(shortTile);
    expect(sheet.hidden).toBe(false);
    expect(JSON.parse(FakeSocket.open?.sent.at(-1) ?? 'null')).toEqual({ type: 'equip', itemId: 'shortSword' });

    deliver(figSnapshot({ ...owned, sword: 'shortSword' }));
    expect(sheet.hidden).toBe(false);
    expect(itemHost.children[0]).toBe(shortTile);
    expect(grapeFace(shortTile)).toEqual({ name: 'Short sword', bonus: '+2 strike', worn: true, seal: 'Equipped' });
    expect(fieldText(sword, 'name')).toBe('Short sword');
    expect(fieldText(sword, 'bonus')).toBe('+2 strike');
    expect(strikeLine.textContent).toBe('6');
    expect(health.textContent).toBe('40 / 70');

    click(sword);
    expect(JSON.parse(FakeSocket.open?.sent.at(-1) ?? 'null')).toEqual({ type: 'unequip', slot: 'sword' });
    deliver(figSnapshot({ ...owned, sword: null }));
    expect(fieldText(sword, 'name')).toBe('Nothing worn');
    expect(grapeFace(shortTile).worn).toBe(false);
    expect(strikeLine.textContent).toBe('4');

    click(leatherTile);
    expect(JSON.parse(FakeSocket.open?.sent.at(-1) ?? 'null')).toEqual({ type: 'equip', itemId: 'leather' });
    deliver(figSnapshot({ ...owned, armor: 'leather', maxHp: 82 }));
    expect(itemHost.children[1]).toBe(leatherTile);
    expect(grapeFace(leatherTile)).toEqual({ name: 'Leather', bonus: '+12 max HP', worn: true, seal: 'Equipped' });
    expect(fieldText(armorLine, 'name')).toBe('Leather');
    expect(fieldText(armorLine, 'bonus')).toBe('+12 max HP');
    expect(health.textContent).toBe('40 / 82');
    expect(strikeLine.textContent).toBe('4');

    click(armorLine);
    expect(JSON.parse(FakeSocket.open?.sent.at(-1) ?? 'null')).toEqual({ type: 'unequip', slot: 'armor' });
    deliver(figSnapshot({ ...owned, armor: null, maxHp: 70 }));
    expect(fieldText(armorLine, 'name')).toBe('Nothing worn');
    expect(health.textContent).toBe('40 / 70');
    expect(sheet.hidden).toBe(false);

    const equipDrag = grapeTransfer();
    fireDrag(shortTile, 'dragstart', equipDrag);
    expect(equipDrag.effectAllowed).toBe('move');
    expect(sword.className).toBe('slot lime');
    expect(armorLine.className).toBe('slot peach');
    expect(hint.textContent).toBe('Strike 4 becomes 6');
    expect(hint.hidden).toBe(false);
    expect(fieldNode(sword, 'drop').hidden).toBe(false);
    expect(fieldNode(armorLine, 'drop').hidden).toBe(true);
    fireDrag(shortTile, 'dragend', equipDrag);
    expect(sword.className).toBe('slot');
    const equipOver = fireDrag(sword, 'dragover', equipDrag);
    expect(equipOver.defaultPrevented).toBe(true);
    expect(equipDrag.dropEffect).toBe('move');
    expect(sword.className).toBe('slot lime');
    expect(armorLine.className).toBe('slot peach');
    fireDrag(sword, 'drop', equipDrag);
    expect(JSON.parse(FakeSocket.open?.sent.at(-1) ?? 'null')).toEqual({ type: 'equip', itemId: 'shortSword' });
    expect(sword.className).toBe('slot');
    deliver(figSnapshot({ ...owned, sword: 'shortSword' }));
    expect(itemHost.children[0]).toBe(shortTile);
    expect(grapeFace(shortTile).seal).toBe('Equipped');
    expect(strikeLine.textContent).toBe('6');
    expect(health.textContent).toBe('40 / 70');

    const unequipDrag = grapeTransfer();
    fireDrag(sword, 'dragstart', unequipDrag);
    expect(itemHost.className).toBe('plum-row lime');
    expect(hint.textContent).toBe('Strike 6 becomes 4');
    fireDrag(sword, 'dragend', unequipDrag);
    const rowOver = fireDrag(itemHost, 'dragover', unequipDrag);
    expect(rowOver.defaultPrevented).toBe(true);
    expect(itemHost.className).toBe('plum-row lime');
    fireDrag(itemHost, 'drop', unequipDrag);
    expect(JSON.parse(FakeSocket.open?.sent.at(-1) ?? 'null')).toEqual({ type: 'unequip', slot: 'sword' });
    deliver(figSnapshot({ ...owned, sword: null }));
    expect(strikeLine.textContent).toBe('4');
    expect(grapeFace(shortTile).worn).toBe(false);

    const wrongDrag = grapeTransfer();
    const sentBeforeWrong = FakeSocket.open?.sent.length ?? 0;
    fireDrag(leatherTile, 'dragstart', wrongDrag);
    expect(armorLine.className).toBe('slot lime');
    expect(sword.className).toBe('slot peach');
    const wrongOver = fireDrag(sword, 'dragover', wrongDrag);
    expect(wrongOver.defaultPrevented).toBe(false);
    fireDrag(sword, 'drop', wrongDrag);
    fireDrag(leatherTile, 'dragend', wrongDrag);
    expect(FakeSocket.open?.sent.length).toBe(sentBeforeWrong);
    expect(sword.className).toBe('slot');

    point(leatherTile);
    click(leatherTile);
    expect(JSON.parse(FakeSocket.open?.sent.at(-1) ?? 'null')).toEqual({ type: 'equip', itemId: 'leather' });
    deliver(figSnapshot({ ...owned, armor: 'leather', maxHp: 82 }));
    expect(health.textContent).toBe('40 / 82');
    expect(fieldText(armorLine, 'name')).toBe('Leather');
    expect(strikeLine.textContent).toBe('4');
    expect(sheet.hidden).toBe(false);
  });
});
