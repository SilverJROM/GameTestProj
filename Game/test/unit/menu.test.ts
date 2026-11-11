// Fig menu and the bag icon. Screen controls stay in every zone. The word Bag is not painted.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CANVAS_WIDTH, viewBox } from '../../src/client/camera';
import { changeAvatarFig, logOutFig, plantFigBoard, sproutAfterLogin } from '../../src/client/main';
import { controlAt, paintControlIcon, townControls, type ScreenControl } from '../../src/client/view';
import { townSpawn } from '../../src/rules/regions';
import { ZOOM_DEFAULT, type ZoneName } from '../../src/rules/tables';

const pageHtml = readFileSync(new URL('../../src/client/index.html', import.meta.url), 'utf8');
const zones: ZoneName[] = ['town', 'green', 'grey', 'cemetery'];

function quietLemon() {
  return {
    send() {},
    close() {},
    addEventListener() {},
  };
}

function rectsOf(control: ScreenControl): string[] {
  const marks: string[] = [];
  const ctx = {
    fillStyle: '',
    font: '',
    fillRect(x: number, y: number, w: number, h: number) {
      marks.push(`${ctx.fillStyle} ${x} ${y} ${w} ${h}`);
    },
    fillText(text: string) {
      marks.push(`text ${text}`);
    },
  };
  paintControlIcon(ctx, control);
  return marks;
}

describe('menu and bag controls', () => {
  it('places the menu left of the bag, same height, with a gap, in every zone', () => {
    const board = plantFigBoard({
      selfId: 'fig-self',
      selfPlace: 'town',
      createSocket: () => quietLemon(),
    });
    for (const place of zones) {
      const rows = townControls(viewBox(place, 400, 400, 0.6));
      const menu = rows.find((row) => row.id === 'menu');
      const bag = rows.find((row) => row.id === 'bag');
      expect(menu, place).toBeDefined();
      expect(bag, place).toBeDefined();
      expect(bag!.x).toBe(CANVAS_WIDTH - 24 - 92);
      expect(bag!.y).toBe(24);
      expect(bag!.width).toBe(92);
      expect(bag!.height).toBe(44);
      expect(menu!.width).toBe(44);
      expect(menu!.height).toBe(44);
      expect(menu!.y).toBe(bag!.y);
      expect(bag!.x - (menu!.x + menu!.width)).toBe(12);
      expect(menu!.x + menu!.width).toBeLessThanOrEqual(bag!.x);
      expect(bag!.text).toBe('Bag');
      expect(bag!.label).toBe('Bag');
      expect(menu!.text).toBe('Menu');
      expect(controlAt(rows, menu!.x + 2, menu!.y + 2)?.id).toBe('menu');
      expect(controlAt(rows, bag!.x + 2, bag!.y + 2)?.id).toBe('bag');
      const gap = controlAt(rows, menu!.x + menu!.width + 6, menu!.y + 8);
      expect(gap === null || gap.id === 'bubble').toBe(true);
      const pastBag = controlAt(rows, bag!.x + bag!.width + 2, bag!.y + 8);
      expect(pastBag === null || pastBag.id === 'bubble').toBe(true);

      board.ingest({
        type: 'snapshot',
        character: { id: 'fig-self', place, gender: 'woman' },
        snapshot: {
          players: [{ id: 'fig-self', name: 'A', place, x: 300, y: 450, facing: 'right', moving: false }],
          monsters: [],
          coins: [],
          pickups: [],
        },
      });
      const ids = board.controls().map((row) => row.id);
      if (place === 'town') expect(ids).toEqual(['bubble', 'menu', 'bag']);
      else expect(ids).toEqual(['menu', 'bag']);
    }
  });

  it('paints the bag and the menu with fillRect only', () => {
    const rows = townControls(viewBox('town', 300, 450, 0.6));
    const bag = rows.find((row) => row.id === 'bag')!;
    const menu = rows.find((row) => row.id === 'menu')!;
    const bagMarks = rectsOf(bag);
    const menuMarks = rectsOf(menu);
    expect(bagMarks.some((row) => row.startsWith('text'))).toBe(false);
    expect(menuMarks.some((row) => row.startsWith('text'))).toBe(false);
    expect(bagMarks).toHaveLength(4);
    expect(menuMarks).toHaveLength(4);
    expect(bagMarks[0]).toBe(`#1c1814 ${bag.x} ${bag.y} ${bag.width} ${bag.height}`);
    expect(menuMarks[0]).toBe(`#1c1814 ${menu.x} ${menu.y} ${menu.width} ${menu.height}`);
    const inside = (mark: string, control: ScreenControl) => {
      const parts = mark.split(' ');
      const x = Number(parts[1]);
      const y = Number(parts[2]);
      const w = Number(parts[3]);
      const h = Number(parts[4]);
      expect(parts[0]).toBe('#ffffff');
      expect(x).toBeGreaterThanOrEqual(control.x);
      expect(y).toBeGreaterThanOrEqual(control.y);
      expect(x + w).toBeLessThanOrEqual(control.x + control.width);
      expect(y + h).toBeLessThanOrEqual(control.y + control.height);
    };
    for (const mark of bagMarks.slice(1)) inside(mark, bag);
    const bars = menuMarks.slice(1);
    for (const mark of bars) inside(mark, menu);
    const barY = bars.map((mark) => Number(mark.split(' ')[2]));
    expect(new Set(barY).size).toBe(3);
    expect(barY[0]).toBeLessThan(barY[1]!);
    expect(barY[1]).toBeLessThan(barY[2]!);
  });

  it('opens one panel at a time from the icons', () => {
    const board = plantFigBoard({
      selfId: 'fig-self',
      selfPlace: 'town',
      createSocket: () => quietLemon(),
    });
    board.ingest({
      type: 'snapshot',
      character: { id: 'fig-self', place: 'town', gender: 'woman' },
      snapshot: { players: [], monsters: [], coins: [], pickups: [] },
    });
    const menu = board.controls().find((row) => row.id === 'menu')!;
    const bag = board.controls().find((row) => row.id === 'bag')!;
    const bubble = board.controls().find((row) => row.id === 'bubble')!;
    expect(board.pressScreen(menu.x + 4, menu.y + 4)).toBe(true);
    expect(board.menuOpen).toBe(true);
    expect(board.bagOpen).toBe(false);
    expect(board.smithOpen).toBe(false);
    expect(board.pressScreen(menu.x + 4, menu.y + 4)).toBe(true);
    expect(board.menuOpen).toBe(false);
    expect(board.pressScreen(bubble.x + 4, bubble.y + 4)).toBe(true);
    expect(board.smithOpen).toBe(true);
    expect(board.pressScreen(menu.x + 4, menu.y + 4)).toBe(true);
    expect(board.menuOpen).toBe(true);
    expect(board.smithOpen).toBe(false);
    expect(board.pressScreen(bag.x + 4, bag.y + 4)).toBe(true);
    expect(board.bagOpen).toBe(true);
    expect(board.menuOpen).toBe(false);
    expect(board.smithOpen).toBe(false);
    expect(board.pressScreen(menu.x - 8, menu.y + 4)).toBe(false);
    expect(board.pressScreen(bag.x + bag.width + 4, bag.y + 4)).toBe(false);
    expect(board.menuOpen).toBe(false);
    expect(board.bagOpen).toBe(true);
  });
});

describe('change avatar and log out', () => {
  it('reloads even when no lemon is open', () => {
    const reload = vi.fn();
    changeAvatarFig(reload);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('posts /api/signout and reloads, and stays with the error when the post fails', async () => {
    const reload = vi.fn();
    const calls: Array<{ url: string; init?: { method: string; credentials: string } }> = [];
    const failed = await logOutFig(async (url, init) => {
      calls.push({ url, init });
      return { ok: false, json: async () => ({ error: 'Session missing.' }) };
    }, reload);
    expect(failed).toEqual({ ok: false, error: 'Session missing.' });
    expect(reload).not.toHaveBeenCalled();
    expect(calls).toEqual([{ url: '/api/signout', init: { method: 'POST', credentials: 'same-origin' } }]);

    const offline = await logOutFig(async () => {
      throw new Error('offline');
    }, reload);
    expect(offline).toEqual({ ok: false, error: 'Could not reach the server.' });
    expect(reload).not.toHaveBeenCalled();

    const signedOut = await logOutFig(async (url, init) => {
      calls.push({ url, init });
      return { ok: true, json: async () => ({ ok: true }) };
    }, reload);
    expect(signedOut).toEqual({ ok: true, error: '' });
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe('menu markup', () => {
  it('lists Change avatar, Settings, Log out, and Close as buttons, plus an empty Settings sheet', () => {
    const menuStart = pageHtml.indexOf('id="menu-panel"');
    const menuEnd = pageHtml.indexOf('</section>', menuStart);
    const menu = pageHtml.slice(menuStart, menuEnd);
    const avatar = menu.indexOf('>Change avatar<');
    const settings = menu.indexOf('>Settings<');
    const logout = menu.indexOf('>Log out<');
    const close = menu.indexOf('>Close<');
    expect(avatar).toBeGreaterThan(0);
    expect(avatar).toBeLessThan(settings);
    expect(settings).toBeLessThan(logout);
    expect(logout).toBeLessThan(close);
    expect(menu.match(/<button type="button"/g)?.length).toBe(4);
    expect(menu).toContain('id="menu-error"');
    const sheetStart = pageHtml.indexOf('id="settings-panel"');
    const sheetEnd = pageHtml.indexOf('</section>', sheetStart);
    const sheet = pageHtml.slice(sheetStart, sheetEnd);
    expect(sheet).toContain('<h3>Settings</h3>');
    expect(sheet).toMatch(/<button type="button" id="settings-close"[^>]*>Close<\/button>/);
    expect(pageHtml).toContain('#menu-panel');
    expect(pageHtml).toContain('top: 10.5%');
    expect(pageHtml).toContain('background: #221c16');
    expect(pageHtml).toContain('font-family: system-ui, Arial, sans-serif');
  });
});

interface FakeEl {
  id: string;
  hidden: boolean;
  textContent: string;
  writes: number;
  width: number;
  height: number;
  style: { cursor: string };
  listeners: Record<string, Array<(event: FakeEvent) => void>>;
  addEventListener(type: string, listener: (event: FakeEvent) => void): void;
  getContext(): unknown;
  getBoundingClientRect(): { left: number; top: number; width: number; height: number };
}

interface FakeEvent {
  button?: number;
  clientX?: number;
  clientY?: number;
  key?: string;
  target?: unknown;
  preventDefault?: () => void;
  stopPropagation?: () => void;
}

function fakeEl(id: string): FakeEl {
  let text = '';
  const el: FakeEl = {
    id,
    hidden: false,
    writes: 0,
    width: 1280,
    height: 720,
    style: { cursor: '' },
    listeners: {},
    addEventListener(type, listener) {
      (el.listeners[type] ??= []).push(listener);
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
    },
  };
  return el;
}

class FigSocket {
  static all: FigSocket[] = [];
  closed = false;
  listeners: Record<string, Array<(event: { data?: unknown }) => void>> = {};

  constructor(_url: string) {
    FigSocket.all.push(this);
  }

  send(_data: string) {}

  close() {
    this.closed = true;
    for (const listener of [...(this.listeners.close ?? [])]) listener({});
  }

  addEventListener(type: string, listener: (event: { data?: unknown }) => void) {
    (this.listeners[type] ??= []).push(listener);
  }

  deliver(message: unknown) {
    const data = JSON.stringify(message);
    for (const listener of this.listeners.message ?? []) listener({ data });
  }
}

describe('menu panel on the page', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    FigSocket.all = [];
  });

  it('toggles from the icon and Esc, keeps one panel, and runs Change avatar and Log out', async () => {
    const texts: string[] = [];
    const canvas = fakeEl('papaya-canvas');
    canvas.getContext = () => ({
      fillStyle: '',
      font: '',
      shadowColor: '',
      shadowBlur: 0,
      clearRect() {},
      fillRect() {},
      fillText(text: string) {
        texts.push(text);
      },
      save() {},
      restore() {},
      translate() {},
      scale() {},
      drawImage() {},
      beginPath() {},
      ellipse() {},
      fill() {},
      stroke() {},
      createRadialGradient() {
        return { addColorStop() {} };
      },
    });
    const menuPanel = fakeEl('menu-panel');
    const settingsPanel = fakeEl('settings-panel');
    const sheet = fakeEl('olive-sheet');
    const smith = fakeEl('quince-smith');
    menuPanel.hidden = true;
    settingsPanel.hidden = true;
    sheet.hidden = true;
    smith.hidden = true;
    const menuError = fakeEl('menu-error');
    const menuAvatar = fakeEl('menu-avatar');
    const menuSettings = fakeEl('menu-settings');
    const menuLogout = fakeEl('menu-logout');
    const menuClose = fakeEl('menu-close');
    const settingsClose = fakeEl('settings-close');
    const elements = new Map<string, FakeEl>([
      ['papaya-canvas', canvas],
      ['menu-panel', menuPanel],
      ['menu-error', menuError],
      ['menu-avatar', menuAvatar],
      ['menu-settings', menuSettings],
      ['menu-logout', menuLogout],
      ['menu-close', menuClose],
      ['settings-panel', settingsPanel],
      ['settings-close', settingsClose],
      ['olive-sheet', sheet],
      ['olive-close', fakeEl('olive-close')],
      ['olive-coins', fakeEl('olive-coins')],
      ['olive-level', fakeEl('olive-level')],
      ['olive-health', fakeEl('olive-health')],
      ['olive-strike', fakeEl('olive-strike')],
      ['olive-xp', fakeEl('olive-xp')],
      ['olive-sword', fakeEl('olive-sword')],
      ['olive-armor', fakeEl('olive-armor')],
      ['olive-items', fakeEl('olive-items')],
      ['olive-hint', fakeEl('olive-hint')],
      ['olive-fig', fakeEl('olive-fig')],
      ['quince-smith', smith],
      ['quince-close', fakeEl('quince-close')],
      ['quince-purse', fakeEl('quince-purse')],
      ['quince-list', fakeEl('quince-list')],
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
    const reloads: string[] = [];
    let failSignOut = true;
    const posts: Array<{ url: string; init?: { method?: string; credentials?: string } }> = [];
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', doc);
    vi.stubGlobal('WebSocket', FigSocket);
    vi.stubGlobal('location', {
      protocol: 'http:',
      host: '127.0.0.1:8787',
      reload() {
        reloads.push('reload');
      },
    });
    vi.stubGlobal('fetch', async (url: string, init?: { method?: string; credentials?: string }) => {
      posts.push({ url, init });
      if (failSignOut) return { ok: false, json: async () => ({ error: 'Session missing.' }) };
      return { ok: true, json: async () => ({ ok: true }) };
    });

    sproutAfterLogin(doc as unknown as Document, { id: 'fig-self', place: 'town', gender: 'woman' });
    expect(FigSocket.all).toHaveLength(1);
    FigSocket.all[0]!.deliver({
      type: 'snapshot',
      character: { id: 'fig-self', place: 'town', gender: 'woman', hp: 70, maxHp: 70 },
      snapshot: { players: [], monsters: [], coins: [], pickups: [] },
    });
    expect(texts).toContain('...');
    expect(texts).not.toContain('Bag');
    expect(texts).not.toContain('Menu');

    const controls = townControls(viewBox('town', townSpawn[0], townSpawn[1], ZOOM_DEFAULT));
    const menu = controls.find((row) => row.id === 'menu')!;
    const bag = controls.find((row) => row.id === 'bag')!;
    const bubble = controls.find((row) => row.id === 'bubble')!;
    const press = (x: number, y: number) => {
      const event: FakeEvent = {
        button: 0,
        clientX: x,
        clientY: y,
        target: canvas,
        preventDefault() {},
        stopPropagation() {},
      };
      for (const listener of canvas.listeners.mousedown ?? []) listener(event);
    };
    const click = (el: FakeEl) => {
      const event: FakeEvent = { button: 0, target: el, preventDefault() {}, stopPropagation() {} };
      for (const listener of el.listeners.click ?? []) listener(event);
    };
    const key = (name: string) => {
      const event: FakeEvent = { key: name, preventDefault() {}, stopPropagation() {} };
      for (const listener of docListeners.keydown ?? []) listener(event);
    };

    press(menu.x + 4, menu.y + 4);
    expect(menuPanel.hidden).toBe(false);
    expect(sheet.hidden).toBe(true);
    expect(smith.hidden).toBe(true);
    press(menu.x + 4, menu.y + 4);
    expect(menuPanel.hidden).toBe(true);
    press(menu.x + 4, menu.y + 4);
    key('Escape');
    expect(menuPanel.hidden).toBe(true);
    expect(sheet.hidden).toBe(true);
    expect(smith.hidden).toBe(true);
    expect(settingsPanel.hidden).toBe(true);

    press(bag.x + 4, bag.y + 4);
    expect(sheet.hidden).toBe(false);
    press(menu.x + 4, menu.y + 4);
    expect(menuPanel.hidden).toBe(false);
    expect(sheet.hidden).toBe(true);
    press(bubble.x + 4, bubble.y + 4);
    expect(smith.hidden).toBe(false);
    expect(menuPanel.hidden).toBe(true);
    expect(sheet.hidden).toBe(true);
    press(menu.x + 4, menu.y + 4);
    expect(menuPanel.hidden).toBe(false);
    expect(smith.hidden).toBe(true);
    click(menuSettings);
    expect(settingsPanel.hidden).toBe(false);
    expect(menuPanel.hidden).toBe(true);
    expect(sheet.hidden).toBe(true);
    expect(smith.hidden).toBe(true);
    key('Escape');
    expect(settingsPanel.hidden).toBe(true);
    press(bag.x + 4, bag.y + 4);
    expect(sheet.hidden).toBe(false);
    key('Escape');
    expect(sheet.hidden).toBe(true);
    expect(menuPanel.hidden).toBe(true);

    press(1200, 690);
    expect(menuPanel.hidden).toBe(true);
    expect(sheet.hidden).toBe(true);
    expect(smith.hidden).toBe(true);

    press(menu.x + 4, menu.y + 4);
    click(menuClose);
    expect(menuPanel.hidden).toBe(true);
    press(menu.x + 4, menu.y + 4);
    click(menuLogout);
    await vi.waitFor(() => {
      expect(menuError.textContent).toBe('Session missing.');
    });
    expect(menuPanel.hidden).toBe(false);
    expect(reloads).toEqual([]);
    expect(FigSocket.all).toHaveLength(1);
    expect(FigSocket.all[0]!.closed).toBe(false);
    expect(posts[0]).toEqual({ url: '/api/signout', init: { method: 'POST', credentials: 'same-origin' } });

    click(menuAvatar);
    expect(FigSocket.all).toHaveLength(1);
    expect(FigSocket.all[0]!.closed).toBe(true);
    expect(reloads).toEqual(['reload']);

    failSignOut = false;
    click(menuLogout);
    await vi.waitFor(() => {
      expect(reloads).toEqual(['reload', 'reload']);
    });
    expect(menuError.textContent).toBe('');
    expect(FigSocket.all).toHaveLength(1);
    expect(posts).toHaveLength(2);
    click(settingsClose);
    expect(settingsPanel.hidden).toBe(true);
  });
});


describe('idle close', () => {
  function recordingLemons() {
    const lemons: { listeners: Map<string, (event: unknown) => void> }[] = [];
    return {
      lemons,
      create() {
        const record = { listeners: new Map<string, (event: unknown) => void>() };
        lemons.push(record);
        return {
          send() {},
          close() {},
          addEventListener(type: string, fn: (event: unknown) => void) {
            record.listeners.set(type, fn);
          },
        };
      },
    };
  }

  it('does not reconnect after the server closes the socket for inactivity (4001) and shows the message once', () => {
    const rec = recordingLemons();
    const onIdle = vi.fn();
    plantFigBoard({ selfId: 'fig-self', selfPlace: 'town', createSocket: () => rec.create(), hooks: { onIdle } });
    expect(rec.lemons).toHaveLength(1);
    rec.lemons[0]!.listeners.get('close')!({ code: 4001 });
    expect(onIdle).toHaveBeenCalledTimes(1);
    expect(rec.lemons).toHaveLength(1);
  });

  it('still reconnects after an ordinary close', () => {
    const rec = recordingLemons();
    const onIdle = vi.fn();
    plantFigBoard({ selfId: 'fig-self', selfPlace: 'town', createSocket: () => rec.create(), hooks: { onIdle } });
    rec.lemons[0]!.listeners.get('close')!({ code: 1006 });
    expect(onIdle).not.toHaveBeenCalled();
    expect(rec.lemons).toHaveLength(2);
  });

  it('the page has the reload message', () => {
    expect(pageHtml).toContain('id="idle-panel"');
    expect(pageHtml).toContain('id="idle-reload"');
  });
});
