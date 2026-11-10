// Kiwi rail: the range sits on the papaya picture, stays hidden until sign-in, and never walks the fig.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canvasToMap, viewBox } from '../../src/client/camera';
import { sproutAfterLogin } from '../../src/client/main';
import { townSpawn } from '../../src/rules/regions';
import { ZOOM_CLOSE, ZOOM_FAR } from '../../src/rules/tables';

const pageHtml = readFileSync(new URL('../../src/client/index.html', import.meta.url), 'utf8');

interface FakeEl {
  id: string;
  hidden: boolean;
  value: string;
  width: number;
  height: number;
  textContent: string;
  listeners: Record<string, Array<(event: FakeEvent) => void>>;
  parent: FakeEl | null;
  addEventListener(type: string, listener: (event: FakeEvent) => void): void;
  getContext(): null;
  getBoundingClientRect(): { left: number; top: number; width: number; height: number };
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

function fakeEl(id: string): FakeEl {
  const el: FakeEl = {
    id,
    hidden: false,
    value: '',
    width: 1280,
    height: 720,
    textContent: '',
    listeners: {},
    parent: null,
    addEventListener(type, listener) {
      (el.listeners[type] ??= []).push(listener);
    },
    getContext() {
      return null;
    },
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 1280, height: 720 };
    },
  };
  return el;
}

function fire(el: FakeEl, type: string, event: FakeEvent): void {
  for (const listener of el.listeners[type] ?? []) listener(event);
  if (!event.stopped && el.parent !== null) fire(el.parent, type, event);
}

describe('zoom slider markup', () => {
  it('is a vertical range from 60 to 75 inside the canvas wrapper, hidden until the map shows', () => {
    expect(pageHtml).toContain('id="melon-stage"');
    const stage = pageHtml.slice(pageHtml.indexOf('id="melon-stage"'), pageHtml.indexOf('id="quince-smith"'));
    expect(stage).toContain('id="papaya-canvas"');
    expect(stage).toContain('id="kiwi-zoom"');
    expect(stage).toContain('Zoom');
    expect(stage).toMatch(/id="kiwi-zoom"[^>]*hidden/);
    expect(stage).toContain('id="zoom-slider"');
    expect(stage).toContain('type="range"');
    expect(stage).toContain('min="60"');
    expect(stage).toContain('max="75"');
    expect(stage).toContain('step="1"');
    expect(stage).toContain('value="60"');
    expect(stage).toContain('orient="vertical"');
    expect(pageHtml).toContain('transform: rotate(180deg)');
  });
});

describe('zoom slider does not walk the map', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('a canvas press walks, and a press or drag on the slider does not', () => {
    const jar = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => (jar.has(key) ? jar.get(key)! : null),
      setItem: (key: string, value: string) => {
        jar.set(key, value);
      },
    });

    const stage = fakeEl('melon-stage');
    const canvas = fakeEl('papaya-canvas');
    const kiwi = fakeEl('kiwi-zoom');
    const slider = fakeEl('zoom-slider');
    slider.value = '60';
    canvas.parent = stage;
    kiwi.parent = stage;
    slider.parent = kiwi;

    const elements = new Map<string, FakeEl>([
      ['papaya-canvas', canvas],
      ['kiwi-zoom', kiwi],
      ['zoom-slider', slider],
      ['quince-smith', fakeEl('quince-smith')],
      ['quince-list', fakeEl('quince-list')],
      ['plum-duel', fakeEl('plum-duel')],
      ['plum-offer', fakeEl('plum-offer')],
      ['plum-accept', fakeEl('plum-accept')],
      ['plum-decline', fakeEl('plum-decline')],
    ]);
    const doc = {
      getElementById: (id: string) => elements.get(id) ?? null,
      createElement: (tag: string) => fakeEl(tag),
    };

    const sent: string[] = [];
    class FakeSocket {
      constructor(_url: string) {}
      send(data: string) {
        sent.push(data);
      }
      close() {}
      addEventListener() {}
    }

    let stagePresses = 0;
    stage.addEventListener('mousedown', () => {
      stagePresses += 1;
    });

    vi.stubGlobal('window', {});
    vi.stubGlobal('document', doc);
    vi.stubGlobal('WebSocket', FakeSocket);
    vi.stubGlobal('location', { protocol: 'http:', host: '127.0.0.1:8787' });

    sproutAfterLogin(doc as unknown as Document, { id: 'fig-self', place: 'town', gender: 'woman' });

    expect(slider.value).toBe('60');

    const press = (target: FakeEl, clientX: number, clientY: number): FakeEvent => {
      const event: FakeEvent = {
        button: 0,
        clientX,
        clientY,
        target,
        stopped: false,
        preventDefault() {},
        stopPropagation() {
          event.stopped = true;
        },
      };
      fire(target, 'mousedown', event);
      return event;
    };

    press(canvas, 640, 500);
    expect(sent).toHaveLength(1);
    const first = JSON.parse(sent[0] ?? 'null') as { type: string; x: number; y: number };
    expect(first.type).toBe('move');
    const [sx, sy] = townSpawn;
    const closeSpot = canvasToMap(viewBox('town', sx, sy, ZOOM_CLOSE), 640, 500);
    expect(first.x).toBeCloseTo(closeSpot.x, 4);
    expect(first.y).toBeCloseTo(closeSpot.y, 4);

    const stageAfterWalk = stagePresses;
    const sliderPress = press(slider, 1260, 200);
    expect(sliderPress.stopped).toBe(true);
    expect(sent).toHaveLength(1);
    expect(stagePresses).toBe(stageAfterWalk);

    slider.value = '75';
    for (const listener of slider.listeners.input ?? []) {
      listener({
        stopped: false,
        preventDefault() {},
        stopPropagation() {},
      });
    }
    expect(jar.get('game.zoom')).toBe('75');

    press(canvas, 640, 500);
    expect(sent).toHaveLength(2);
    const second = JSON.parse(sent[1] ?? 'null') as { type: string; x: number; y: number };
    expect(second.type).toBe('move');
    const farSpot = canvasToMap(viewBox('town', sx, sy, ZOOM_FAR), 640, 500);
    expect(second.x).toBeCloseTo(farSpot.x, 4);
    expect(second.y).toBeCloseTo(farSpot.y, 4);
    expect(second.x).not.toBeCloseTo(first.x, 1);

    slider.value = '70';
    const key: FakeEvent = {
      key: 'ArrowDown',
      target: slider,
      stopped: false,
      preventDefault() {
        key.stopped = key.stopped;
      },
      stopPropagation() {
        key.stopped = true;
      },
    };
    let prevented = false;
    key.preventDefault = () => {
      prevented = true;
    };
    for (const listener of slider.listeners.keydown ?? []) listener(key);
    expect(prevented).toBe(true);
    expect(slider.value).toBe('71');
    expect(jar.get('game.zoom')).toBe('71');
    expect(sent).toHaveLength(2);
  });
});
