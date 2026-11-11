// Beet click box: the padded picture, shared by the painter and the click peel.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mapToCanvas, viewBox } from '../../src/client/camera';
import { peelClick, type ClickBeet, type ClickOrchard } from '../../src/client/input';
import { sproutAfterLogin } from '../../src/client/main';
import { scaleFor, scaledSize } from '../../src/client/sprites';
import {
  BEET_PAD_PX,
  beetSpriteRect,
  createOliveReel,
  forgetGuavaPixels,
  melonHolds,
  paintOrchard,
  rememberGuavaPixels,
} from '../../src/client/view';
import type { MonsterSnapshot } from '../../src/protocol';
import { mangoForgeBox } from '../../src/rules/regions';
import { ZOOM_DEFAULT } from '../../src/rules/tables';

const NATURAL = {
  wolf: { width: 604, height: 496 },
  bear: { width: 607, height: 449 },
  skeleton: { width: 458, height: 1641 },
} as const;

const KINDS = ['wolf', 'bear', 'skeleton'] as const;

function orchard(monsters: readonly ClickBeet[], place: ClickOrchard['selfPlace'] = 'green'): ClickOrchard {
  return {
    selfId: 'fig-self',
    selfPlace: place,
    players: [{ id: 'fig-other', x: 700, y: 500 }],
    monsters,
  };
}

function beet(id: string, kind: string, x: number, y: number, src?: string): ClickBeet {
  return src === undefined ? { id, kind, x, y } : { id, kind, x, y, src };
}

function monster(id: string, kind: string, x: number, y: number, swung = false): MonsterSnapshot {
  const zone = kind === 'bear' ? 'grey' : kind === 'skeleton' ? 'cemetery' : 'green';
  return { id, kind, zone, x, y, hp: 8, aggro: false, swung };
}

describe('beet sprite rectangle', () => {
  afterEach(() => {
    forgetGuavaPixels();
  });

  it('stands each kind on its feet, centred, with a 6 px pad and the stand picture width', () => {
    for (const kind of KINDS) {
      const feetX = 240;
      const feetY = 360;
      const box = beetSpriteRect(feetX, feetY, kind);
      const picture = scaledSize(NATURAL[kind].width, NATURAL[kind].height, kind);
      expect(box.pictureHeight, kind).toBe(scaleFor(kind));
      expect(box.pictureWidth, kind).toBe(picture.width);
      expect(box.width, kind).toBe(picture.width + BEET_PAD_PX * 2);
      expect(box.height, kind).toBe(picture.height + BEET_PAD_PX * 2);
      expect(box.x + box.width / 2, kind).toBe(feetX);
      expect(box.y + BEET_PAD_PX + box.pictureHeight, kind).toBe(feetY);
      expect(box.y + box.height - BEET_PAD_PX, kind).toBe(feetY);
    }
  });

  it('uses a loaded picture proportion and falls back to the kind ratio before that', () => {
    const bare = beetSpriteRect(10, 80, 'skeleton', '/avatars/skeleton/unpicked.png');
    const stand = beetSpriteRect(10, 80, 'skeleton');
    expect(bare).toEqual(stand);
    expect(bare.pictureWidth).not.toBe(bare.pictureHeight);

    rememberGuavaPixels('/avatars/wolf/ripe.png', 200, 100);
    const ripe = beetSpriteRect(0, 50, 'wolf', '/avatars/wolf/ripe.png');
    expect(ripe.pictureWidth).toBe(scaledSize(200, 100, 'wolf').width);
    expect(ripe.pictureWidth).not.toBe(beetSpriteRect(0, 50, 'wolf').pictureWidth);
  });

  it('paints each still from the same box the click uses', () => {
    const reel = createOliveReel();
    const parked = KINDS.map((kind, index) => monster(kind, kind, 40 + index * 30, 90 + index));
    const standing = paintOrchard(reel, { players: [], monsters: parked, coins: [], pickups: [] });
    for (const kind of KINDS) {
      const still = standing.find((row) => row.role === 'monster' && row.id === kind);
      expect(still, kind).toBeDefined();
      const box = beetSpriteRect(still!.x, still!.y, kind, still!.src);
      expect(still!.width, kind).toBe(box.pictureWidth);
      expect(still!.height, kind).toBe(box.pictureHeight);
      expect(still!.src, kind).toBe(`/avatars/${kind}/stand.png`);
    }

    const chased = paintOrchard(reel, {
      players: [],
      monsters: [monster('wolf', 'wolf', 80, 90, true)],
      coins: [],
      pickups: [],
    });
    const bite = chased.find((row) => row.role === 'monster' && row.id === 'wolf');
    expect(bite?.src).toBe('/avatars/wolf/bite.png');
    const biteBox = beetSpriteRect(bite!.x, bite!.y, 'wolf', bite!.src);
    expect(bite!.width).toBe(biteBox.pictureWidth);
    expect(biteBox.pictureWidth).toBeGreaterThan(beetSpriteRect(bite!.x, bite!.y, 'wolf').pictureWidth);
  });
});

describe('peelClick on the beet picture', () => {
  function attackAt(kind: (typeof KINDS)[number], x: number, y: number, src?: string) {
    return peelClick({ x, y, button: 0 }, orchard([beet(`beet-${kind}`, kind, 200, 300, src)]));
  }

  it('hits the head, chest, legs, and padded corners of each kind, and misses outside', () => {
    for (const kind of KINDS) {
      const box = beetSpriteRect(200, 300, kind);
      const midX = box.x + box.width / 2;
      const headY = box.y + BEET_PAD_PX + 1;
      const chestY = 300 - box.pictureHeight / 2;
      const legY = 300 - 1;
      expect(300 - headY, kind).toBeGreaterThan(scaleFor(kind) / 2);

      for (const spot of [
        { x: midX, y: headY },
        { x: midX, y: chestY },
        { x: midX, y: legY },
        { x: box.x, y: box.y },
        { x: box.x + box.width, y: box.y },
        { x: box.x, y: box.y + box.height },
        { x: box.x + box.width, y: box.y + box.height },
      ]) {
        expect(attackAt(kind, spot.x, spot.y), `${kind} ${spot.x},${spot.y}`).toEqual({
          message: { type: 'attack', monsterId: `beet-${kind}`, once: true, walk: true },
          smithOpen: false,
        });
      }

      for (const spot of [
        { x: box.x - 1, y: chestY },
        { x: box.x + box.width + 1, y: chestY },
        { x: midX, y: box.y - 1 },
        { x: midX, y: box.y + box.height + 1 },
      ]) {
        expect(attackAt(kind, spot.x, spot.y).message, `${kind} miss ${spot.x},${spot.y}`).toEqual({
          type: 'move',
          x: spot.x,
          y: spot.y,
        });
      }
    }
  });

  it('uses the picture that is on screen when the still src is known', () => {
    const stand = beetSpriteRect(100, 200, 'wolf');
    const bite = beetSpriteRect(100, 200, 'wolf', '/avatars/wolf/bite.png');
    const x = stand.x + stand.width + 1;
    const y = 200 - 2;
    expect(x).toBeLessThanOrEqual(bite.x + bite.width);
    expect(melonHolds(stand, x, y)).toBe(false);
    expect(melonHolds(bite, x, y)).toBe(true);
    const standing = orchard([beet('beet-wolf', 'wolf', 100, 200)]);
    const biting = orchard([beet('beet-wolf', 'wolf', 100, 200, '/avatars/wolf/bite.png')]);
    expect(peelClick({ x, y, button: 0 }, standing).message?.type).toBe('move');
    expect(peelClick({ x, y, button: 0 }, biting)).toEqual({
      message: { type: 'attack', monsterId: 'beet-wolf', once: true, walk: true },
      smithOpen: false,
    });
  });

  it('picks the beet with the lowest feet, and the nearest centre when the feet tie', () => {
    const back = beet('back', 'wolf', 0, 100);
    const front = beet('front', 'bear', 0, 140);
    const backBox = beetSpriteRect(back.x, back.y, back.kind);
    const frontBox = beetSpriteRect(front.x, front.y, front.kind);
    const shared = { x: back.x, y: Math.max(backBox.y, frontBox.y) + 1 };
    expect(melonHolds(backBox, shared.x, shared.y)).toBe(true);
    expect(melonHolds(frontBox, shared.x, shared.y)).toBe(true);
    const backCentreY = backBox.y + backBox.height / 2;
    const frontCentreY = frontBox.y + frontBox.height / 2;
    expect((shared.x - back.x) ** 2 + (shared.y - backCentreY) ** 2).toBeLessThan(
      (shared.x - front.x) ** 2 + (shared.y - frontCentreY) ** 2,
    );
    expect(peelClick({ x: shared.x, y: shared.y, button: 0 }, orchard([back, front]))).toEqual({
      message: { type: 'attack', monsterId: 'front', once: true, walk: true },
      smithOpen: false,
    });

    const left = beet('left', 'wolf', 0, 100);
    const right = beet('right', 'wolf', 40, 100);
    const leftBox = beetSpriteRect(left.x, left.y, left.kind);
    const rightBox = beetSpriteRect(right.x, right.y, right.kind);
    const tieY = leftBox.y + leftBox.height / 2;
    const midX = (left.x + right.x) / 2;
    const nearerLeft = midX - 4;
    const nearerRight = midX + 4;
    expect(melonHolds(leftBox, nearerLeft, tieY)).toBe(true);
    expect(melonHolds(rightBox, nearerLeft, tieY)).toBe(true);
    expect(melonHolds(leftBox, nearerRight, tieY)).toBe(true);
    expect(melonHolds(rightBox, nearerRight, tieY)).toBe(true);
    expect(peelClick({ x: nearerLeft, y: tieY, button: 0 }, orchard([right, left])).message).toEqual({
      type: 'attack',
      monsterId: 'left',
      once: true,
      walk: true,
    });
    expect(peelClick({ x: nearerRight, y: tieY, button: 0 }, orchard([left, right])).message).toEqual({
      type: 'attack',
      monsterId: 'right',
      once: true,
      walk: true,
    });
  });

  it('leaves players, the fountain, and the forge on their old clicks', () => {
    // A left click on another player only walks, wherever on the body it lands.
    expect(peelClick({ x: 700, y: 500 - 40, button: 0 }, orchard([]))).toEqual({ message: { type: 'move', x: 700, y: 460 }, smithOpen: false });
    // A right click anywhere on the player's drawn body (head, chest, feet) opens the duel menu and sends nothing yet.
    for (const y of [500 - 52, 500 - 30, 500]) {
      expect(peelClick({ x: 700, y, button: 2 }, orchard([]))).toEqual({ message: null, smithOpen: false, duelMenu: { playerId: 'fig-other' } });
    }
    // Beside the body it is nothing.
    expect(peelClick({ x: 760, y: 480, button: 2 }, orchard([]))).toEqual({ message: null, smithOpen: false });

    const town = orchard([beet('beet-wolf', 'wolf', 900, 360)], 'town');
    expect(peelClick({ x: 242, y: 566, button: 0 }, town)).toEqual({
      message: { type: 'fountain', x: 242, y: 566 },
      smithOpen: false,
    });
    expect(peelClick({ x: 150, y: 480, button: 0 }, town)).toEqual({ message: null, smithOpen: true });
    const forgeX = (mangoForgeBox.x0 + mangoForgeBox.x1) / 2;
    const forgeY = (mangoForgeBox.y0 + mangoForgeBox.y1) / 2;
    expect(peelClick({ x: forgeX, y: forgeY, button: 0 }, town).smithOpen).toBe(true);

    // A right click on a monster walks to it and keeps swinging (no once flag).
    const rightOnBeet = peelClick({ x: 900, y: 360 - 20, button: 2 }, town);
    expect(rightOnBeet.message).toEqual({ type: 'attack', monsterId: 'beet-wolf' });
  });
});

describe('beet hover cursor and rim', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sets a hand and a warm rim on the beet, and clears both on the way out', () => {
    const rounds: Array<{ x: number; y: number; w: number; h: number; r: number }> = [];
    let clears = 0;
    let strokes = 0;
    const ctx = {
      fillStyle: '',
      font: '',
      strokeStyle: '',
      lineWidth: 0,
      lineJoin: '',
      shadowColor: '',
      shadowBlur: 0,
      clearRect() {
        clears += 1;
      },
      fillRect() {},
      fillText() {},
      save() {},
      restore() {},
      translate() {},
      scale() {},
      drawImage() {},
      beginPath() {},
      stroke() {
        strokes += 1;
      },
      roundRect(x: number, y: number, w: number, h: number, r: number) {
        rounds.push({ x, y, w, h, r });
      },
      ellipse() {},
      fill() {},
      createRadialGradient() {
        return { addColorStop() {} };
      },
    };
    const canvas = {
      id: 'papaya-canvas',
      hidden: false,
      width: 1280,
      height: 720,
      style: { cursor: '' },
      listeners: {} as Record<string, Array<(event: { clientX?: number; clientY?: number }) => void>>,
      addEventListener(type: string, listener: (event: { clientX?: number; clientY?: number }) => void) {
        (canvas.listeners[type] ??= []).push(listener);
      },
      getContext() {
        return ctx;
      },
      getBoundingClientRect() {
        return { left: 0, top: 0, width: 1280, height: 720 };
      },
    };
    const doc = {
      hidden: false,
      getElementById(id: string) {
        return id === 'papaya-canvas' ? canvas : null;
      },
      createElement() {
        return { width: 0, height: 0, getContext: () => null };
      },
      addEventListener() {},
    };

    class FakeSocket {
      static latest: FakeSocket | null = null;
      listeners: Record<string, Array<(event: { data?: unknown }) => void>> = {};
      constructor(_url: string) {
        FakeSocket.latest = this;
      }
      send() {}
      close() {}
      addEventListener(type: string, listener: (event: { data?: unknown }) => void) {
        (this.listeners[type] ??= []).push(listener);
      }
      deliver(data: unknown) {
        const payload = JSON.stringify(data);
        for (const listener of this.listeners.message ?? []) listener({ data: payload });
      }
    }

    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', doc);
    vi.stubGlobal('WebSocket', FakeSocket);
    vi.stubGlobal('location', { protocol: 'http:', host: '127.0.0.1:8787' });

    sproutAfterLogin(doc as unknown as Document, { id: 'fig-self', place: 'town', gender: 'woman' });
    FakeSocket.latest?.deliver({
      type: 'snapshot',
      character: { id: 'fig-self', place: 'town', gender: 'woman' },
      snapshot: {
        players: [
          {
            id: 'fig-self',
            name: 'fig-self',
            x: 300,
            y: 440,
            facing: 'right',
            moving: false,
            place: 'town',
            gender: 'woman',
            duelPartnerId: null,
          },
          {
            id: 'fig-other',
            name: 'fig-other',
            x: 240,
            y: 520,
            facing: 'right',
            moving: false,
            place: 'town',
            gender: 'man',
            duelPartnerId: null,
          },
        ],
        monsters: [
          monster('beet-wolf', 'wolf', 360, 440),
          monster('beet-bear', 'bear', 500, 440),
          monster('beet-skeleton', 'skeleton', 640, 440),
        ],
        coins: [{ id: 'seed', ownerId: 'fig-self', x: 300, y: 360, value: 3 }],
        pickups: [],
      },
    });

    expect(clears).toBe(1);
    expect(strokes).toBe(0);
    expect(canvas.style.cursor).toBe('');

    const view = viewBox('town', 300, 440, ZOOM_DEFAULT);
    const pointAt = (mapX: number, mapY: number) => {
      const screen = mapToCanvas(view, mapX, mapY);
      const event = { clientX: screen.x, clientY: screen.y };
      for (const listener of canvas.listeners.pointermove ?? []) listener(event);
    };
    const expectRim = (id: string, feetX: number, feetY: number, kind: string) => {
      const box = beetSpriteRect(feetX, feetY, kind, `/avatars/${kind}/stand.png`);
      const screen = mapToCanvas(view, feetX - box.pictureWidth / 2, feetY - box.pictureHeight);
      const width = box.pictureWidth * view.scale;
      const height = box.pictureHeight * view.scale;
      const rim = rounds[rounds.length - 1];
      expect(rim, id).toMatchObject({ x: screen.x, y: screen.y, w: width, h: height });
      expect(rim?.r, id).toBe(Math.min(6, width / 2, height / 2));
      expect(ctx.lineWidth).toBe(2);
      expect(ctx.strokeStyle).toBe('rgba(255, 244, 224, 0.72)');
      expect(ctx.lineJoin).toBe('round');
    };

    const wolf = beetSpriteRect(360, 440, 'wolf');
    const wolfClears = clears;
    pointAt(wolf.x + wolf.width / 2, wolf.y + wolf.height / 2);
    expect(canvas.style.cursor).toBe('pointer');
    expect(clears).toBe(wolfClears + 1);
    expect(strokes).toBe(1);
    expectRim('beet-wolf', 360, 440, 'wolf');

    const stillOver = strokes;
    pointAt(wolf.x + BEET_PAD_PX + 1, wolf.y + wolf.height / 2);
    expect(canvas.style.cursor).toBe('pointer');
    expect(strokes).toBe(stillOver);
    expect(clears).toBe(wolfClears + 1);

    const bear = beetSpriteRect(500, 440, 'bear');
    pointAt(bear.x + 1, bear.y + 1);
    expect(canvas.style.cursor).toBe('pointer');
    expect(clears).toBe(wolfClears + 2);
    expectRim('beet-bear', 500, 440, 'bear');

    const bone = beetSpriteRect(640, 440, 'skeleton');
    pointAt(bone.x + bone.width / 2, 440 - 1);
    expect(canvas.style.cursor).toBe('pointer');
    expectRim('beet-skeleton', 640, 440, 'skeleton');

    const beforeLeave = clears;
    pointAt(240, 520);
    expect(canvas.style.cursor).toBe('');
    expect(clears).toBe(beforeLeave + 1);
    const strokesAfterPlayer = strokes;
    pointAt(300, 360);
    pointAt((mangoForgeBox.x0 + mangoForgeBox.x1) / 2, (mangoForgeBox.y0 + mangoForgeBox.y1) / 2);
    expect(canvas.style.cursor).toBe('');
    expect(strokes).toBe(strokesAfterPlayer);
    expect(clears).toBe(beforeLeave + 1);

    pointAt(wolf.x + wolf.width / 2, wolf.y + BEET_PAD_PX + 2);
    expect(canvas.style.cursor).toBe('pointer');
    const hoverStrokes = strokes;
    for (const listener of canvas.listeners.pointerleave ?? []) listener({});
    expect(canvas.style.cursor).toBe('');
    expect(clears).toBe(beforeLeave + 3);
    expect(strokes).toBe(hoverStrokes);
    for (const listener of canvas.listeners.pointerleave ?? []) listener({});
    expect(clears).toBe(beforeLeave + 3);
    expect(canvas.style.cursor).toBe('');
  });
});
