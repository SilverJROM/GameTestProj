// Plum jar: resolution, sound, and shortcut keys saved in one browser.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canvasToMap, viewBox } from '../../src/client/camera';
import { townControls } from '../../src/client/view';
import { townSpawn } from '../../src/rules/regions';
import { ZOOM_CLOSE } from '../../src/rules/tables';
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  actionForKey,
  adoptSettings,
  bindableKey,
  commitSettings,
  getSettings,
  loadSettings,
  onSettingsChange,
  presetBox,
  rebindKey,
  resetShortcutKeys,
  saveSettings,
  type FigJar,
  type FigSettings,
} from '../../src/client/settings';

function memoryJar(seed: string | null = null, extra: Record<string, string> = {}): FigJar & { dump(): Map<string, string> } {
  const rows = new Map<string, string>(Object.entries(extra));
  if (seed !== null) rows.set(SETTINGS_KEY, seed);
  return {
    getItem(key: string) {
      return rows.has(key) ? rows.get(key)! : null;
    },
    setItem(key: string, value: string) {
      rows.set(key, value);
    },
    dump() {
      return rows;
    },
  };
}

describe('settings load, save, and validation', () => {
  it('starts from the light defaults', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      resolution: 'fit',
      musicVolume: 25,
      effectsVolume: 35,
      muted: false,
      keys: { bag: 'b', menu: 'm', settings: 's' },
    });
    expect(loadSettings(memoryJar())).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips a saved fig and keeps one storage key', () => {
    const jar = memoryJar();
    const next: FigSettings = {
      resolution: 'large',
      musicVolume: 10,
      effectsVolume: 80,
      muted: true,
      keys: { bag: 'q', menu: 'n', settings: 'h' },
    };
    saveSettings(jar, next);
    expect(loadSettings(jar)).toEqual(next);
    expect([...jar.dump().keys()]).toEqual([SETTINGS_KEY]);
    expect(SETTINGS_KEY).toBe('pl-settings');
  });

  it('falls back field by field for bad JSON, wrong types, and out-of-range numbers', () => {
    const hostile: FigJar = {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('blocked');
      },
    };
    expect(loadSettings(hostile)).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSettings(hostile, DEFAULT_SETTINGS)).not.toThrow();
    expect(loadSettings(memoryJar('{'))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(memoryJar('null'))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(memoryJar('[]'))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(memoryJar('42'))).toEqual(DEFAULT_SETTINGS);

    const mixed = memoryJar(
      JSON.stringify({
        resolution: 'huge',
        musicVolume: '25',
        effectsVolume: 10,
        muted: 'yes',
        keys: { bag: 'Q', menu: 'q', settings: 1, extra: 'z' },
        spare: true,
      }),
    );
    expect(loadSettings(mixed)).toEqual({
      ...DEFAULT_SETTINGS,
      effectsVolume: 10,
    });

    const ranges = memoryJar(
      JSON.stringify({
        resolution: 'small',
        musicVolume: 150,
        effectsVolume: -1,
        muted: true,
        keys: { bag: 'x' },
      }),
    );
    expect(loadSettings(ranges)).toEqual({
      resolution: 'small',
      musicVolume: 25,
      effectsVolume: 35,
      muted: true,
      keys: { bag: 'x', menu: 'm', settings: 's' },
    });

    const clash = memoryJar(JSON.stringify({ keys: { bag: 'm' } }));
    expect(loadSettings(clash).keys).toEqual(DEFAULT_SETTINGS.keys);

    const moved = memoryJar(JSON.stringify({ keys: { bag: 'm', menu: 'n' } }));
    expect(loadSettings(moved).keys).toEqual({ bag: 'm', menu: 'n', settings: 's' });

    const both = memoryJar(JSON.stringify({ keys: { bag: 'm', menu: 'm' } }));
    expect(loadSettings(both).keys).toEqual(DEFAULT_SETTINGS.keys);

    const rounded = memoryJar(JSON.stringify({ musicVolume: 25.4, effectsVolume: 0 }));
    expect(loadSettings(rounded).musicVolume).toBe(25);
    expect(loadSettings(rounded).effectsVolume).toBe(0);
  });

  it('tells listeners when the live fig changes', () => {
    const jar = memoryJar();
    const seen: FigSettings[] = [];
    const drop = onSettingsChange((s) => {
      seen.push(s);
    });
    adoptSettings(jar);
    expect(getSettings()).toEqual(DEFAULT_SETTINGS);
    const committed = commitSettings(jar, { ...getSettings(), musicVolume: 40, muted: true });
    expect(committed.musicVolume).toBe(40);
    expect(committed.muted).toBe(true);
    expect(seen.at(-1)?.musicVolume).toBe(40);
    expect(seen.at(-1)?.muted).toBe(true);
    committed.musicVolume = 99;
    expect(getSettings().musicVolume).toBe(40);
    drop();
    commitSettings(jar, { ...getSettings(), effectsVolume: 5 });
    expect(seen.at(-1)?.effectsVolume).not.toBe(5);
  });
});

describe('preset display size', () => {
  it('keeps 16:9, caps fixed widths, and fits the window', () => {
    expect(presetBox('small', 1920, 1080)).toEqual({ width: 960, height: 540 });
    expect(presetBox('medium', 1920, 1080)).toEqual({ width: 1280, height: 720 });
    expect(presetBox('large', 1920, 1080)).toEqual({ width: 1600, height: 900 });
    expect(presetBox('large', 1400, 900)).toEqual({ width: 1400, height: 1400 * 9 / 16 });
    expect(presetBox('small', 800, 600)).toEqual({ width: 800, height: 450 });
    expect(presetBox('medium', 1000, 200)).toEqual({ width: 1000, height: 1000 * 9 / 16 });
    expect(presetBox('fit', 1920, 1080)).toEqual({ width: 1920, height: 1080 });
    expect(presetBox('fit', 1000, 1000)).toEqual({ width: 1000, height: 1000 * 9 / 16 });
    expect(presetBox('fit', 2000, 800)).toEqual({ width: 800 * 16 / 9, height: 800 });
    expect(presetBox('fullscreen', 1000, 1000)).toEqual(presetBox('fit', 1000, 1000));
    expect(presetBox('fullscreen', 2000, 800)).toEqual(presetBox('fit', 2000, 800));
    expect(presetBox('fit', Number.NaN, 800)).toEqual({ width: 0, height: 0 });
    expect(presetBox('large', -20, 900)).toEqual({ width: 0, height: 0 });
    for (const preset of ['small', 'medium', 'large', 'fit', 'fullscreen'] as const) {
      const box = presetBox(preset, 1100, 700);
      expect(box.width).toBeLessThanOrEqual(1100);
      expect(box.height).toBeLessThanOrEqual(700 + 0.001);
      if (box.height > 0) expect(box.width / box.height).toBeCloseTo(16 / 9, 6);
    }
  });
});

describe('shortcut rebinding helpers', () => {
  const base = DEFAULT_SETTINGS;

  it('rebinds in lower case, refuses conflicts and forbidden keys, and resets', () => {
    const ok = rebindKey(base, 'bag', 'K');
    expect(ok).toEqual({ ok: true, settings: { ...base, keys: { bag: 'k', menu: 'm', settings: 's' } } });
    const again = rebindKey(base, 'menu', 'm');
    expect(again.ok).toBe(true);
    const clash = rebindKey(base, 'bag', 'm');
    expect(clash).toEqual({ ok: false, reason: 'conflict', message: 'Already used by Menu.' });
    expect(base.keys.bag).toBe('b');
    for (const key of ['Escape', 'Tab', 'Enter', ' ', 'Shift', 'Control', 'Alt', 'Meta']) {
      const refused = rebindKey(base, 'settings', key);
      expect(refused.ok).toBe(false);
      if (!refused.ok) expect(refused.reason).toBe('forbidden');
    }
    expect(bindableKey({ key: 'b', ctrlKey: true })).toBeNull();
    expect(bindableKey({ key: 'ArrowLeft' })).toBe('arrowleft');
    expect(actionForKey(base, 'B')).toBe('bag');
    expect(actionForKey(base, 'Escape')).toBeNull();
    const changed = resetShortcutKeys({ ...base, keys: { bag: 'q', menu: 'n', settings: 'h' }, musicVolume: 4 });
    expect(changed.keys).toEqual(DEFAULT_SETTINGS.keys);
    expect(changed.musicVolume).toBe(4);
    const jar = memoryJar();
    saveSettings(jar, changed);
    rebindKey(loadSettings(jar), 'bag', 'k');
    const rebound = rebindKey(loadSettings(jar), 'bag', 'k');
    if (rebound.ok) saveSettings(jar, rebound.settings);
    expect(loadSettings(jar).keys.bag).toBe('k');
    saveSettings(jar, resetShortcutKeys(loadSettings(jar)));
    expect(loadSettings(jar).keys).toEqual(DEFAULT_SETTINGS.keys);
  });
});

interface FakeEl {
  id: string;
  hidden: boolean;
  value: string;
  checked: boolean;
  title: string;
  className: string;
  tagName: string;
  type: string;
  style: { width?: string; height?: string; marginTop?: string; marginLeft?: string; marginRight?: string; cursor?: string };
  attrs: Record<string, string>;
  listeners: Record<string, Array<(event: FakeEvent) => void>>;
  textContent: string;
  addEventListener(type: string, listener: (event: FakeEvent) => void): void;
  setAttribute(name: string, value: string): void;
  getContext(): null;
  getBoundingClientRect(): { left: number; top: number; width: number; height: number };
  requestFullscreen?: () => Promise<void> | void;
}

interface FakeEvent {
  button?: number;
  clientX?: number;
  clientY?: number;
  key?: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  target?: unknown;
  preventDefault(): void;
  stopPropagation(): void;
}

function fakeEl(id: string): FakeEl {
  let text = '';
  const el: FakeEl = {
    id,
    hidden: false,
    value: '',
    checked: false,
    title: '',
    className: '',
    tagName: 'BUTTON',
    type: '',
    style: {},
    attrs: {},
    listeners: {},
    addEventListener(type, listener) {
      (el.listeners[type] ??= []).push(listener);
    },
    setAttribute(name, value) {
      el.attrs[name] = value;
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
      text = String(value);
    },
  };
  return el;
}

class FigSocket {
  static latest: FigSocket | null = null;
  sent: string[] = [];
  listeners: Record<string, Array<(event: { data?: unknown }) => void>> = {};
  constructor(_url: string) {
    FigSocket.latest = this;
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {}
  addEventListener(type: string, listener: (event: { data?: unknown }) => void) {
    (this.listeners[type] ??= []).push(listener);
  }
}

async function boot(options?: {
  jar?: Map<string, string>;
  width?: number;
  height?: number;
  rect?: { left: number; top: number; width: number; height: number };
}) {
  vi.resetModules();
  const jar = options?.jar ?? new Map<string, string>();
  const rect = options?.rect ?? { left: 0, top: 0, width: 1280, height: 720 };
  const win = {
    innerWidth: options?.width ?? 1920,
    innerHeight: options?.height ?? 1080,
    resize: null as (() => void) | null,
    addEventListener(type: string, fn: () => void) {
      if (type === 'resize') win.resize = fn;
    },
    removeEventListener() {},
  };
  const ids = [
    'papaya-canvas',
    'melon-stage',
    'menu-panel',
    'settings-panel',
    'settings-close',
    'settings-note',
    'settings-res-small',
    'settings-res-medium',
    'settings-res-large',
    'settings-res-fit',
    'settings-res-fullscreen',
    'settings-music',
    'settings-music-num',
    'settings-effects',
    'settings-effects-num',
    'settings-mute',
    'settings-key-bag',
    'settings-key-menu',
    'settings-key-settings',
    'settings-reset-keys',
    'olive-sheet',
    'olive-key-hint',
    'kiwi-zoom',
    'zoom-slider',
    'quince-smith',
    'quince-close',
    'quince-purse',
    'quince-list',
    'plum-duel',
    'plum-offer',
    'plum-accept',
    'plum-decline',
  ];
  const elements = new Map<string, FakeEl>(ids.map((id) => [id, fakeEl(id)]));
  const canvas = elements.get('papaya-canvas')!;
  canvas.hidden = false;
  canvas.getBoundingClientRect = () => ({ ...rect });
  elements.get('menu-panel')!.hidden = true;
  elements.get('settings-panel')!.hidden = true;
  elements.get('olive-sheet')!.hidden = true;
  elements.get('quince-smith')!.hidden = true;
  elements.get('settings-music')!.value = '25';
  elements.get('settings-effects')!.value = '35';
  const stage = elements.get('melon-stage')!;
  stage.requestFullscreen = () => {
    throw new Error('no fullscreen');
  };
  const docListeners: Record<string, Array<(event: FakeEvent) => void>> = {};
  const doc = {
    fullscreenElement: null as unknown,
    getElementById: (id: string) => elements.get(id) ?? null,
    createElement: (tag: string) => fakeEl(tag),
    addEventListener(type: string, listener: (event: FakeEvent) => void) {
      (docListeners[type] ??= []).push(listener);
    },
    exitFullscreen() {
      doc.fullscreenElement = null;
      return Promise.resolve();
    },
  };
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => (jar.has(key) ? jar.get(key)! : null),
    setItem: (key: string, value: string) => {
      jar.set(key, value);
    },
  });
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', doc);
  vi.stubGlobal('WebSocket', FigSocket);
  vi.stubGlobal('location', { protocol: 'http:', host: '127.0.0.1:8787' });
  const main = await import('../../src/client/main');
  const settings = await import('../../src/client/settings');
  main.sproutAfterLogin(doc as unknown as Document, { id: 'fig-self', place: 'town', gender: 'woman' });
  async function click(id: string): Promise<void> {
    const el = elements.get(id)!;
    const event: FakeEvent = { button: 0, target: el, preventDefault() {}, stopPropagation() {} };
    for (const listener of el.listeners.click ?? []) await listener(event);
    await Promise.resolve();
  }
  function key(name: string, target?: unknown, extra: Partial<FakeEvent> = {}): void {
    const event: FakeEvent = {
      key: name,
      target,
      preventDefault() {},
      stopPropagation() {},
      ...extra,
    };
    for (const listener of docListeners.keydown ?? []) listener(event);
  }
  function pressCanvas(clientX: number, clientY: number): void {
    const event: FakeEvent = {
      button: 0,
      clientX,
      clientY,
      target: canvas,
      preventDefault() {},
      stopPropagation() {},
    };
    for (const listener of canvas.listeners.mousedown ?? []) listener(event);
  }
  return { jar, win, rect, elements, canvas, stage, doc, settings, click, key, pressCanvas, docListeners };
}

describe('settings on the page', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    FigSocket.latest = null;
  });

  it('sizes each preset, refuses fullscreen, and keeps clicks on the displayed rect', async () => {
    const page = await boot({ width: 2000, height: 900 });
    const fit = presetBox('fit', 2000, 900);
    expect(page.stage.style.width).toBe(`${fit.width}px`);
    expect(page.stage.style.height).toBe(`${fit.height}px`);
    expect(page.elements.get('settings-res-fit')!.attrs['aria-pressed']).toBe('true');

    const spot = canvasToMap(viewBox('town', townSpawn[0], townSpawn[1], ZOOM_CLOSE), 640, 500);
    const expectSameSpot = (viewW: number, viewH: number) => {
      page.rect.left = 0;
      page.rect.top = 0;
      page.rect.width = viewW;
      page.rect.height = viewH;
      page.pressCanvas((640 / 1280) * viewW, (500 / 720) * viewH);
      const raw = FigSocket.latest?.sent.at(-1) ?? '';
      const message = JSON.parse(raw) as { type: string; x: number; y: number };
      expect(message.type).toBe('move');
      expect(message.x).toBeCloseTo(spot.x, 4);
      expect(message.y).toBeCloseTo(spot.y, 4);
    };
    expectSameSpot(960, 540);
    expectSameSpot(1280, 720);
    expectSameSpot(1600, 900);

    await page.click('settings-res-small');
    expect(page.settings.getSettings().resolution).toBe('small');
    expect(page.stage.style.width).toBe('960px');
    expect(page.stage.style.height).toBe('540px');
    expect(page.elements.get('settings-res-small')!.attrs['aria-pressed']).toBe('true');
    expect(page.elements.get('settings-res-fit')!.attrs['aria-pressed']).toBe('false');

    await page.click('settings-res-medium');
    expect(page.stage.style.width).toBe('1280px');
    expect(page.stage.style.height).toBe('720px');
    await page.click('settings-res-large');
    expect(page.stage.style.width).toBe('1600px');
    expect(page.stage.style.height).toBe('900px');

    page.win.innerWidth = 1000;
    page.win.innerHeight = 800;
    page.win.resize?.();
    const capped = presetBox('large', 1000, 800);
    expect(page.stage.style.width).toBe(`${capped.width}px`);
    expect(page.stage.style.height).toBe(`${capped.height}px`);

    await page.click('settings-res-fit');
    const fitted = presetBox('fit', 1000, 800);
    expect(page.stage.style.width).toBe(`${fitted.width}px`);
    expect(page.settings.getSettings().resolution).toBe('fit');

    const before = page.settings.getSettings().resolution;
    await page.click('settings-res-fullscreen');
    expect(page.elements.get('settings-note')!.textContent).toBe('Fullscreen was blocked.');
    expect(page.settings.getSettings().resolution).toBe(before);

    delete page.stage.requestFullscreen;
    await page.click('settings-res-fullscreen');
    expect(page.settings.getSettings().resolution).toBe(before);

    page.stage.requestFullscreen = () => {
      page.doc.fullscreenElement = page.stage;
      return Promise.resolve();
    };
    await page.click('settings-res-fullscreen');
    await vi.waitFor(() => expect(page.settings.getSettings().resolution).toBe('fullscreen'));
    expect(page.stage.style.width).toBe('100%');
    expect(page.elements.get('settings-note')!.textContent).toBe('');

    page.win.innerWidth = 2000;
    page.win.innerHeight = 900;
    await page.click('settings-res-medium');
    await vi.waitFor(() => expect(page.settings.getSettings().resolution).toBe('medium'));
    expect(page.doc.fullscreenElement).toBeNull();
    expect(page.stage.style.width).toBe('1280px');

    const slider = page.elements.get('zoom-slider')!;
    slider.value = '70';
    for (const listener of slider.listeners.input ?? []) {
      listener({ preventDefault() {}, stopPropagation() {} });
    }
    expect(page.jar.get('game.zoom')).toBe('70');
  });

  it('rebinds, refuses clashes and forbidden keys, toggles panels, and ignores typing', async () => {
    const page = await boot();
    expect(page.elements.get('settings-key-bag')!.textContent).toBe('B');
    expect(page.elements.get('settings-key-menu')!.textContent).toBe('M');
    expect(page.elements.get('settings-key-settings')!.textContent).toBe('S');
    expect(page.elements.get('olive-key-hint')!.textContent).toBe('(B)');

    const bag = townControls(viewBox('town', townSpawn[0], townSpawn[1], ZOOM_CLOSE)).find((row) => row.id === 'bag')!;
    const move: FakeEvent = {
      clientX: bag.x + 4,
      clientY: bag.y + 4,
      target: page.canvas,
      preventDefault() {},
      stopPropagation() {},
    };
    for (const listener of page.canvas.listeners.pointermove ?? []) listener(move);
    expect(page.canvas.title).toBe('Bag (B)');

    page.key('b');
    expect(page.elements.get('olive-sheet')!.hidden).toBe(false);
    page.key('b');
    expect(page.elements.get('olive-sheet')!.hidden).toBe(true);
    page.key('m');
    expect(page.elements.get('menu-panel')!.hidden).toBe(false);
    page.key('s');
    expect(page.elements.get('settings-panel')!.hidden).toBe(false);
    expect(page.elements.get('menu-panel')!.hidden).toBe(true);
    page.key('Escape');
    expect(page.elements.get('settings-panel')!.hidden).toBe(true);

    page.key('s');
    expect(page.elements.get('settings-panel')!.hidden).toBe(false);
    await page.click('settings-key-bag');
    expect(page.elements.get('settings-key-bag')!.textContent).toBe('…');
    page.key('Escape');
    expect(page.elements.get('settings-key-bag')!.textContent).toBe('B');
    expect(page.elements.get('settings-panel')!.hidden).toBe(false);

    await page.click('settings-key-bag');
    page.key('k');
    expect(page.settings.getSettings().keys.bag).toBe('k');
    expect(page.elements.get('settings-key-bag')!.textContent).toBe('K');
    expect(page.elements.get('olive-sheet')!.hidden).toBe(true);
    expect(JSON.parse(page.jar.get('pl-settings') ?? '{}').keys.bag).toBe('k');

    await page.click('settings-key-bag');
    page.key('m');
    expect(page.elements.get('settings-note')!.textContent).toBe('Already used by Menu.');
    expect(page.settings.getSettings().keys.bag).toBe('k');
    expect(page.settings.getSettings().keys.menu).toBe('m');

    for (const forbidden of ['Tab', 'Enter', ' ', 'Shift', 'Control', 'Alt', 'Meta']) {
      await page.click('settings-key-menu');
      page.key(forbidden);
      expect(page.elements.get('settings-note')!.textContent).toBe('That key cannot be bound.');
      expect(page.settings.getSettings().keys.menu).toBe('m');
    }
    await page.click('settings-key-settings');
    page.key('g', undefined, { ctrlKey: true });
    expect(page.settings.getSettings().keys.settings).toBe('s');

    await page.click('settings-reset-keys');
    expect(page.settings.getSettings().keys).toEqual({ bag: 'b', menu: 'm', settings: 's' });
    expect(page.elements.get('settings-key-bag')!.textContent).toBe('B');
    expect(JSON.parse(page.jar.get('pl-settings') ?? '{}').keys).toEqual({ bag: 'b', menu: 'm', settings: 's' });

    await page.click('settings-key-bag');
    page.key('k');
    const reloaded = page.settings.loadSettings({
      getItem: (key: string) => page.jar.get(key) ?? null,
      setItem() {},
    });
    expect(reloaded.keys.bag).toBe('k');

    page.key('s');
    expect(page.elements.get('settings-panel')!.hidden).toBe(true);
    const field = fakeEl('kiwi-user');
    field.tagName = 'INPUT';
    field.type = 'text';
    page.key('k', field);
    expect(page.elements.get('olive-sheet')!.hidden).toBe(true);
    const area = fakeEl('note');
    area.tagName = 'TEXTAREA';
    page.key('k', area);
    expect(page.elements.get('olive-sheet')!.hidden).toBe(true);
    page.key('k');
    expect(page.elements.get('olive-sheet')!.hidden).toBe(false);
    page.canvas.hidden = true;
    page.key('k');
    expect(page.elements.get('olive-sheet')!.hidden).toBe(false);
    page.canvas.hidden = false;
    page.key('m');
    expect(page.elements.get('menu-panel')!.hidden).toBe(false);
    expect(page.elements.get('olive-sheet')!.hidden).toBe(true);
    page.key('k');
    expect(page.elements.get('olive-sheet')!.hidden).toBe(false);
    expect(page.elements.get('menu-panel')!.hidden).toBe(true);
    for (const listener of page.canvas.listeners.pointermove ?? []) listener(move);
    expect(page.canvas.title).toBe('Bag (K)');
  });

  it('updates volume sliders, mute, and the listener immediately', async () => {
    const page = await boot();
    const seen: Array<{ music: number; effects: number; muted: boolean }> = [];
    const drop = page.settings.onSettingsChange((s) => {
      seen.push({ music: s.musicVolume, effects: s.effectsVolume, muted: s.muted });
    });
    expect(page.settings.getSettings().musicVolume).toBe(25);
    expect(page.settings.getSettings().effectsVolume).toBe(35);
    expect(page.settings.getSettings().muted).toBe(false);
    expect(page.elements.get('settings-music-num')!.textContent).toBe('25');
    expect(page.elements.get('settings-effects-num')!.textContent).toBe('35');

    const music = page.elements.get('settings-music')!;
    music.value = '40';
    for (const listener of music.listeners.input ?? []) listener({ preventDefault() {}, stopPropagation() {} });
    expect(page.settings.getSettings().musicVolume).toBe(40);
    expect(page.elements.get('settings-music-num')!.textContent).toBe('40');

    const effects = page.elements.get('settings-effects')!;
    effects.value = '12';
    for (const listener of effects.listeners.input ?? []) listener({ preventDefault() {}, stopPropagation() {} });
    expect(page.settings.getSettings().effectsVolume).toBe(12);
    expect(page.elements.get('settings-effects-num')!.textContent).toBe('12');

    const mute = page.elements.get('settings-mute')!;
    mute.checked = true;
    for (const listener of mute.listeners.change ?? []) listener({ preventDefault() {}, stopPropagation() {} });
    expect(page.settings.getSettings().muted).toBe(true);
    expect(seen.at(-1)).toEqual({ music: 40, effects: 12, muted: true });
    const saved = JSON.parse(page.jar.get('pl-settings') ?? '{}') as FigSettings;
    expect(saved.musicVolume).toBe(40);
    expect(saved.effectsVolume).toBe(12);
    expect(saved.muted).toBe(true);
    drop();
  });
});
