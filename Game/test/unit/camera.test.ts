// Guava window: an area share of the zone box, one 16:9 scale, clicks that round-trip, and a jar-backed setter.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  canvasToMap,
  mapToCanvas,
  viewBox,
  zoneBox,
} from '../../src/client/camera';
import { plantFigBoard } from '../../src/client/main';
import { MAP_HEIGHT, MAP_WIDTH, townSpawn } from '../../src/rules/regions';
import { ZOOM_CLOSE, ZOOM_FAR, type ZoneName } from '../../src/rules/tables';

const ZONES: ZoneName[] = ['town', 'cemetery', 'green', 'grey'];

// Math.round of the exact area window. A couple of hand-rounded table cells differ by a pixel.
const ROUNDED: Record<ZoneName, Record<number, { width: number; height: number; scale: number }>> = {
  town: {
    [ZOOM_CLOSE]: { width: 640, height: 360, scale: 2.0 },
    [ZOOM_FAR]: { width: 715, height: 402, scale: 1.79 },
  },
  cemetery: {
    [ZOOM_CLOSE]: { width: 390, height: 219, scale: 3.28 },
    [ZOOM_FAR]: { width: 436, height: 245, scale: 2.94 },
  },
  green: {
    [ZOOM_CLOSE]: { width: 762, height: 429, scale: 1.68 },
    [ZOOM_FAR]: { width: 852, height: 479, scale: 1.5 },
  },
  grey: {
    [ZOOM_CLOSE]: { width: 692, height: 389, scale: 1.85 },
    [ZOOM_FAR]: { width: 774, height: 435, scale: 1.65 },
  },
};

function openBoard() {
  const sockets: { sent: string[] }[] = [];
  const board = plantFigBoard({
    selfId: 'fig-self',
    selfPlace: 'town',
    createSocket() {
      const lemon = {
        sent: [] as string[],
        send(data: string) {
          lemon.sent.push(data);
        },
        close() {},
        addEventListener() {},
      };
      sockets.push(lemon);
      return lemon;
    },
  });
  return board;
}

describe('camera view box', () => {
  for (const place of ZONES) {
    for (const zoom of [ZOOM_CLOSE, ZOOM_FAR]) {
      it(`${place} at ${zoom}: area share, 16:9, rounded window`, () => {
        const box = zoneBox(place);
        const boxW = box.x1 - box.x0;
        const boxH = box.y1 - box.y0;
        const mid = { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 };
        const view = viewBox(place, mid.x, mid.y, zoom);
        const want = ROUNDED[place][zoom]!;
        expect(view.width * view.height).toBeCloseTo(zoom * boxW * boxH, 4);
        expect(view.width / view.height).toBeCloseTo(CANVAS_WIDTH / CANVAS_HEIGHT, 6);
        expect(view.scale).toBeCloseTo(CANVAS_HEIGHT / view.height, 6);
        expect(view.width * view.scale).toBeCloseTo(CANVAS_WIDTH, 5);
        expect(view.height * view.scale).toBeCloseTo(CANVAS_HEIGHT, 5);
        expect(Math.round(view.width)).toBe(want.width);
        expect(Math.round(view.height)).toBe(want.height);
        expect(Math.abs(view.scale - want.scale)).toBeLessThanOrEqual(0.01);
        expect(view.width < MAP_WIDTH && view.height < MAP_HEIGHT).toBe(true);
      });
    }

    it(`${place}: the default share is the close end`, () => {
      const box = zoneBox(place);
      const mid = { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 };
      expect(viewBox(place, mid.x, mid.y)).toEqual(viewBox(place, mid.x, mid.y, ZOOM_CLOSE));
    });

    it(`${place}: a share below 0.60 or above 0.75 is clamped`, () => {
      const box = zoneBox(place);
      const mid = { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 };
      const close = viewBox(place, mid.x, mid.y, ZOOM_CLOSE);
      const far = viewBox(place, mid.x, mid.y, ZOOM_FAR);
      for (const low of [0, 0.5, ZOOM_CLOSE - 0.01]) {
        expect(viewBox(place, mid.x, mid.y, low)).toEqual(close);
      }
      for (const high of [ZOOM_FAR + 0.01, 1, 2]) {
        expect(viewBox(place, mid.x, mid.y, high)).toEqual(far);
      }
    });

    it(`${place}: stays centred on the player when the map allows`, () => {
      const box = zoneBox(place);
      const mid = { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 };
      for (const zoom of [ZOOM_CLOSE, ZOOM_FAR]) {
        const view = viewBox(place, mid.x, mid.y, zoom);
        const cx = view.x + view.width / 2;
        const cy = view.y + view.height / 2;
        if (view.x > 0 && view.x + view.width < MAP_WIDTH) expect(cx).toBeCloseTo(mid.x, 6);
        if (view.y > 0 && view.y + view.height < MAP_HEIGHT) expect(cy).toBeCloseTo(mid.y, 6);
      }
    });

    it(`${place}: the window never leaves the map`, () => {
      const spots: Array<[number, number]> = [
        [0, 0],
        [MAP_WIDTH, MAP_HEIGHT],
        [0, MAP_HEIGHT],
        [MAP_WIDTH, 0],
        [MAP_WIDTH / 2, MAP_HEIGHT / 2],
      ];
      for (const zoom of [ZOOM_CLOSE, ZOOM_FAR, 0.1, 4]) {
        for (const [px, py] of spots) {
          const view = viewBox(place, px, py, zoom);
          expect(view.x).toBeGreaterThanOrEqual(0);
          expect(view.y).toBeGreaterThanOrEqual(0);
          expect(view.x + view.width).toBeLessThanOrEqual(MAP_WIDTH + 1e-6);
          expect(view.y + view.height).toBeLessThanOrEqual(MAP_HEIGHT + 1e-6);
        }
      }
      expect(viewBox(place, 0, 0).x).toBe(0);
      expect(viewBox(place, 0, 0).y).toBe(0);
      const far = viewBox(place, MAP_WIDTH, MAP_HEIGHT, ZOOM_FAR);
      expect(far.x + far.width).toBeCloseTo(MAP_WIDTH, 6);
      expect(far.y + far.height).toBeCloseTo(MAP_HEIGHT, 6);
    });

    it(`${place}: map and canvas round-trip at both ends of the rail`, () => {
      const box = zoneBox(place);
      const px = (box.x0 + box.x1) / 2;
      const py = (box.y0 + box.y1) / 2;
      for (const zoom of [ZOOM_CLOSE, ZOOM_FAR]) {
        const view = viewBox(place, px, py, zoom);
        for (const [mx, my] of [
          [view.x + view.width / 2, view.y + view.height / 2],
          [view.x, view.y],
          [view.x + view.width / 3, view.y + view.height / 4],
          [view.x + view.width, view.y + view.height],
        ] as const) {
          const canvas = mapToCanvas(view, mx, my);
          const back = canvasToMap(view, canvas.x, canvas.y);
          expect(back.x).toBeCloseTo(mx, 6);
          expect(back.y).toBeCloseTo(my, 6);
          const rounded = canvasToMap(view, Math.round(canvas.x), Math.round(canvas.y));
          expect(Math.abs(rounded.x - mx)).toBeLessThanOrEqual(1);
          expect(Math.abs(rounded.y - my)).toBeLessThanOrEqual(1);
        }
      }
    });
  }
});

describe('board zoom', () => {
  function stubJar(initial: Record<string, string> = {}) {
    const jar = new Map(Object.entries(initial));
    const storage = {
      getItem: (key: string) => (jar.has(key) ? jar.get(key)! : null),
      setItem: (key: string, value: string) => {
        jar.set(key, value);
      },
      removeItem: (key: string) => {
        jar.delete(key);
      },
      clear: () => {
        jar.clear();
      },
      key: (index: number) => [...jar.keys()][index] ?? null,
      get length() {
        return jar.size;
      },
    };
    vi.stubGlobal('localStorage', storage);
    return jar;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts at the close end when the jar is empty', () => {
    const jar = stubJar();
    const board = openBoard();
    const [sx, sy] = townSpawn;
    expect(board.zoom()).toBe(ZOOM_CLOSE);
    expect(board.camera()).toEqual(viewBox('town', sx, sy, ZOOM_CLOSE));
    expect(jar.has('game.zoom')).toBe(false);
  });

  it('setZoom changes the camera and the next board reads the jar', () => {
    const jar = stubJar();
    const board = openBoard();
    const [sx, sy] = townSpawn;
    const before = board.camera();
    board.setZoom(ZOOM_FAR);
    expect(board.zoom()).toBe(ZOOM_FAR);
    expect(board.camera()).toEqual(viewBox('town', sx, sy, ZOOM_FAR));
    expect(board.camera().width).toBeGreaterThan(before.width);
    expect(jar.get('game.zoom')).toBe('75');

    const again = openBoard();
    expect(again.zoom()).toBe(ZOOM_FAR);
    expect(again.camera()).toEqual(viewBox('town', sx, sy, ZOOM_FAR));
  });

  it('reads a stored percent and keeps that share in another section', () => {
    stubJar({ 'game.zoom': '70' });
    const board = openBoard();
    const [sx, sy] = townSpawn;
    expect(board.zoom()).toBeCloseTo(0.7, 6);
    expect(board.camera()).toEqual(viewBox('town', sx, sy, 0.7));
    board.ingest({
      type: 'snapshot',
      character: { id: 'fig-self', place: 'green', gender: 'woman' },
      snapshot: {
        players: [{ id: 'fig-self', name: 'fig-self', x: 900, y: 500, facing: 'right', moving: false, place: 'green' }],
        monsters: [],
        coins: [],
        pickups: [],
      },
    });
    expect(board.zoom()).toBeCloseTo(0.7, 6);
    expect(board.camera()).toEqual(viewBox('green', 900, 500, 0.7));
  });

  it('starts at the close end when the stored value is invalid', () => {
    const [sx, sy] = townSpawn;
    for (const bad of ['nope', '', '50', '90', '0.5', '1']) {
      stubJar({ 'game.zoom': bad });
      const board = openBoard();
      expect(board.zoom(), bad).toBe(ZOOM_CLOSE);
      expect(board.camera()).toEqual(viewBox('town', sx, sy, ZOOM_CLOSE));
    }
  });

  it('still runs when the jar throws', () => {
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('blocked');
      },
    });
    const board = openBoard();
    const [sx, sy] = townSpawn;
    expect(board.camera()).toEqual(viewBox('town', sx, sy, ZOOM_CLOSE));
    expect(() => board.setZoom(ZOOM_FAR)).not.toThrow();
    expect(board.zoom()).toBe(ZOOM_FAR);
    expect(board.camera()).toEqual(viewBox('town', sx, sy, ZOOM_FAR));
  });

  it('canvasToMap through the board camera stays on the clicked spot at both ends', () => {
    stubJar();
    const board = openBoard();
    board.ingest({
      type: 'snapshot',
      character: { id: 'fig-self', place: 'town', gender: 'woman' },
      snapshot: {
        players: [{ id: 'fig-self', name: 'fig-self', x: 300, y: 440, facing: 'right', moving: false, place: 'town' }],
        monsters: [],
        coins: [],
        pickups: [],
      },
    });
    const spot = { x: 280, y: 460 };
    for (const zoom of [ZOOM_CLOSE, ZOOM_FAR]) {
      board.setZoom(zoom);
      const view = board.camera();
      const pixel = mapToCanvas(view, spot.x, spot.y);
      const back = canvasToMap(view, pixel.x, pixel.y);
      expect(back.x).toBeCloseTo(spot.x, 5);
      expect(back.y).toBeCloseTo(spot.y, 5);
    }
  });
});
