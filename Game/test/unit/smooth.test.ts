// Citrus glide: displayed feet chase the latest snapshot, and frames paint between mangos.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canvasToMap, mapToCanvas, viewBox } from '../../src/client/camera';
import {
  attachCitrusLoop,
  plantFigBoard,
  sproutAfterLogin,
  type CitrusHost,
  type FigBoard,
  type GuavaStill,
} from '../../src/client/main';
import { CITRUS_SNAP_PX, CITRUS_SPEED_CAP, glideCitrus, type CitrusSpot } from '../../src/client/smooth';
import { scaleFor } from '../../src/client/sprites';
import { beetSpriteRect, townControls } from '../../src/client/view';
import { kaleConstants, ZOOM_DEFAULT } from '../../src/rules/tables';

const FIG_PACE = kaleConstants.walkSpeedPxPerSec;
const BEET_PACE = kaleConstants.monsterChaseSpeedPxPerSec;

function dist(a: CitrusSpot, b: CitrusSpot): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

describe('glideCitrus', () => {
  it('uses an 80 px snap and a 1.2 pace cap', () => {
    expect(CITRUS_SNAP_PX).toBe(80);
    expect(CITRUS_SPEED_CAP).toBe(1.2);
    expect(FIG_PACE).toBe(120);
    expect(BEET_PACE).toBe(90);
  });

  it('is pure: same inputs, same spot, and it never reads the clock', () => {
    const shown = { x: 3, y: 4 };
    const target = { x: 9, y: 8 };
    const dateNow = Date.now;
    Date.now = () => {
      throw new Error('papaya clock');
    };
    try {
      const first = glideCitrus(shown, target, 0.016, FIG_PACE);
      const second = glideCitrus(shown, target, 0.016, FIG_PACE);
      expect(first).toEqual(second);
      expect(shown).toEqual({ x: 3, y: 4 });
      expect(target).toEqual({ x: 9, y: 8 });
    } finally {
      Date.now = dateNow;
    }
  });

  it('snaps a new fig and a jump farther than 80 px, even when dt is 0', () => {
    expect(glideCitrus(null, { x: 500, y: -20 }, 0, FIG_PACE)).toEqual({ x: 500, y: -20 });
    expect(glideCitrus({ x: 0, y: 0 }, { x: 80.5, y: 0 }, 0.5, FIG_PACE)).toEqual({ x: 80.5, y: 0 });
    expect(glideCitrus({ x: 0, y: 0 }, { x: 0, y: -200 }, 0.016, BEET_PACE)).toEqual({ x: 0, y: -200 });
    expect(glideCitrus({ x: 5, y: 5 }, { x: 200, y: 5 }, 0, FIG_PACE)).toEqual({ x: 200, y: 5 });
    const near = glideCitrus({ x: 0, y: 0 }, { x: CITRUS_SNAP_PX, y: 0 }, 0.016, FIG_PACE);
    expect(near.x).toBeGreaterThan(0);
    expect(near.x).toBeLessThan(CITRUS_SNAP_PX);
  });

  it('converges without overshooting, and a long frame lands on the mango', () => {
    let spot: CitrusSpot = { x: 10, y: 20 };
    const target = { x: 52, y: 76 };
    let left = dist(spot, target);
    expect(left).toBeLessThan(CITRUS_SNAP_PX);
    for (let i = 0; i < 80 && left > 0; i += 1) {
      const next = glideCitrus(spot, target, 0.016, FIG_PACE);
      const dx = target.x - spot.x;
      const dy = target.y - spot.y;
      const stepX = next.x - spot.x;
      const stepY = next.y - spot.y;
      const gap = Math.hypot(dx, dy);
      expect(Math.abs(stepX * dy - stepY * dx)).toBeLessThan(1e-6);
      expect(stepX * dx + stepY * dy).toBeGreaterThanOrEqual(-1e-9);
      expect(Math.hypot(stepX, stepY)).toBeLessThanOrEqual(gap + 1e-9);
      expect(Math.hypot(stepX, stepY)).toBeLessThanOrEqual(FIG_PACE * CITRUS_SPEED_CAP * 0.016 + 1e-9);
      const after = dist(next, target);
      expect(after).toBeLessThanOrEqual(left + 1e-9);
      spot = next;
      left = after;
    }
    expect(spot).toEqual(target);
    expect(glideCitrus(spot, target, 0.016, FIG_PACE)).toEqual(target);
    expect(glideCitrus({ x: 0, y: 0 }, { x: 30, y: 40 }, 10, FIG_PACE)).toEqual({ x: 30, y: 40 });
  });

  it('steps in proportion to dt at 16 ms and 33 ms, and stays under the pace cap', () => {
    const start = { x: 2, y: 2 };
    const target = { x: 26, y: 34 };
    const at16 = glideCitrus(start, target, 0.016, FIG_PACE);
    const at33 = glideCitrus(start, target, 0.033, FIG_PACE);
    const step16 = dist(start, at16);
    const step33 = dist(start, at33);
    expect(step33 / step16).toBeCloseTo(0.033 / 0.016, 6);
    expect(step16).toBeLessThanOrEqual(FIG_PACE * CITRUS_SPEED_CAP * 0.016 + 1e-9);
    expect(step33).toBeLessThanOrEqual(FIG_PACE * CITRUS_SPEED_CAP * 0.033 + 1e-9);

    const ripe = glideCitrus({ x: 0, y: 0 }, { x: FIG_PACE * 0.1, y: 0 }, 0.016, FIG_PACE);
    expect(ripe.x).toBeCloseTo(FIG_PACE * 0.016, 6);
    const ripe33 = glideCitrus({ x: 0, y: 0 }, { x: BEET_PACE * 0.1, y: 0 }, 0.033, BEET_PACE);
    expect(ripe33.x).toBeCloseTo(BEET_PACE * 0.033, 6);

    const caught = glideCitrus({ x: 0, y: 0 }, { x: 79, y: 0 }, 0.016, BEET_PACE);
    expect(caught.x).toBeGreaterThan(BEET_PACE * 0.016);
    expect(caught.x).toBeLessThanOrEqual(BEET_PACE * CITRUS_SPEED_CAP * 0.016 + 1e-9);

    const first = glideCitrus(start, target, 0.016, FIG_PACE);
    const second = glideCitrus(first, target, 0.016, FIG_PACE);
    const ratio = dist(first, second) / dist(start, first);
    expect(ratio).toBeGreaterThan(0.97);
    expect(ratio).toBeLessThan(1.03);

    expect(glideCitrus({ x: 5, y: 5 }, { x: 20, y: 5 }, 0, FIG_PACE)).toEqual({ x: 5, y: 5 });
    expect(glideCitrus({ x: 5, y: 5 }, { x: 20, y: 5 }, -1, FIG_PACE)).toEqual({ x: 5, y: 5 });
    expect(glideCitrus({ x: 5, y: 5 }, { x: 20, y: 5 }, 0.016, 0)).toEqual({ x: 5, y: 5 });
  });
});

interface LoopRig {
  board: FigBoard;
  paints: GuavaStill[][];
  pump(timeMs: number): void;
  queued(): boolean;
  visible: { value: boolean };
  stop(): void;
}

function openLoop(): LoopRig {
  const paints: GuavaStill[][] = [];
  let queued: { id: number; cb: (timeMs: number) => void } | null = null;
  let seq = 1;
  const visible = { value: true };
  const host: CitrusHost = {
    requestAnimationFrame(callback) {
      const id = seq;
      seq += 1;
      queued = { id, cb: callback };
      return id;
    },
    cancelAnimationFrame(id) {
      if (queued?.id === id) queued = null;
    },
    screenVisible() {
      return visible.value;
    },
    paint(stills) {
      paints.push(stills.map((still) => ({ ...still })));
    },
  };
  const sent: string[] = [];
  const board = plantFigBoard({
    selfId: 'fig-self',
    selfPlace: 'town',
    selfGender: 'woman',
    createSocket() {
      return {
        send(data: string) {
          sent.push(data);
        },
        close() {},
        addEventListener() {},
      };
    },
  });
  const loop = attachCitrusLoop(board, host);
  loop.start();
  return {
    board,
    paints,
    visible,
    stop: () => loop.stop(),
    queued: () => queued !== null,
    pump(timeMs: number) {
      const job = queued;
      if (job === null) throw new Error('no papaya frame queued');
      queued = null;
      job.cb(timeMs);
    },
  };
}

function figAt(id: string, x: number, y: number, facing: 'left' | 'right' = 'right', moving = false) {
  return {
    id,
    name: id,
    x,
    y,
    facing,
    moving,
    place: 'town' as const,
    duelPartnerId: null,
    gender: 'woman' as const,
    attacking: false,
  };
}

function wolfAt(x: number, y: number) {
  return { id: 'beet-wolf', kind: 'wolf', zone: 'green' as const, x, y, hp: 10, swung: false, aggro: false };
}

function mango(players: ReturnType<typeof figAt>[], monsters: ReturnType<typeof wolfAt>[] = [], extra: Record<string, unknown> = {}) {
  return {
    type: 'snapshot' as const,
    character: { id: 'fig-self', place: 'town' as const, gender: 'woman' as const },
    snapshot: { players, monsters, coins: [], pickups: [], ...extra },
  };
}

function feet(stills: readonly GuavaStill[], role: GuavaStill['role'], id: string): GuavaStill {
  const found = stills.find((still) => still.role === role && still.id === id);
  if (found === undefined) throw new Error(`no ${role} ${id}`);
  return found;
}

describe('displayed feet', () => {
  it('snaps a new fig and a far jump, and glides a short step', () => {
    const { board, stop } = openLoop();
    board.ingest(mango([figAt('fig-self', 300, 440)]));
    expect(feet(board.pose(), 'player', 'fig-self')).toMatchObject({ x: 300, y: 440 });
    board.ingest(mango([figAt('fig-self', 900, 500)]));
    expect(feet(board.pose(), 'player', 'fig-self')).toMatchObject({ x: 900, y: 500 });
    expect(board.camera()).toEqual(viewBox('town', 900, 500, ZOOM_DEFAULT));

    board.ingest(mango([figAt('fig-self', 920, 500)]));
    expect(feet(board.pose(), 'player', 'fig-self').x).toBe(900);
    board.glideFeet(0.05);
    const moved = feet(board.pose(), 'player', 'fig-self');
    expect(moved.x).toBeGreaterThan(900);
    expect(moved.x).toBeLessThan(920);
    expect(board.camera()).toEqual(viewBox('town', moved.x, moved.y, board.zoom()));
    stop();
  });

  it('keeps facing and the walk bob on the server reel', () => {
    const { board, stop } = openLoop();
    board.ingest(mango([figAt('fig-self', 300, 440, 'left', true)]));
    expect(feet(board.draw(), 'player', 'fig-self')).toMatchObject({ still: 'walk-1', facing: 'left' });
    expect(feet(board.pose(), 'player', 'fig-self').still).toBe('walk-1');
    expect(feet(board.pose(), 'player', 'fig-self').still).toBe('walk-1');
    expect(feet(board.draw(), 'player', 'fig-self').still).toBe('walk-2');
    stop();
  });

  it('hits the displayed monster, the displayed fig, and the bubble on the gliding camera', () => {
    const sent: string[] = [];
    const board = plantFigBoard({
      selfId: 'fig-self',
      selfPlace: 'town',
      selfGender: 'woman',
      createSocket() {
        return {
          send(data: string) {
            sent.push(data);
          },
          close() {},
          addEventListener() {},
        };
      },
    });
    const other = figAt('fig-other', 600, 420);
    const wolf = wolfAt(500, 400);
    // Feet sit inside the town window so a 30 px lag actually slides the camera.
    // A fig near the left map edge clamps the view, and the bubble would not move.
    board.ingest(mango([figAt('fig-self', 400, 440), other], [wolf], {
      coins: [{ id: 'seed', ownerId: 'fig-self', x: 450, y: 460, value: 3 }],
    }));
    board.ingest(mango([figAt('fig-self', 430, 440), figAt('fig-other', 630, 420)], [wolfAt(530, 400)], {
      coins: [{ id: 'seed', ownerId: 'fig-self', x: 450, y: 460, value: 3 }],
    }));

    board.click({ x: 500, y: 400, button: 0 });
    expect(JSON.parse(sent[0] ?? 'null')).toEqual({ type: 'attack', monsterId: 'beet-wolf', once: true, walk: true });
    // The displayed head is part of the sprite box.
    board.click({ x: 500, y: 400 - scaleFor('wolf') + 1, button: 0 });
    expect(JSON.parse(sent[1] ?? 'null')).toEqual({ type: 'attack', monsterId: 'beet-wolf', once: true, walk: true });
    board.click({ x: 530, y: 400, button: 0 });
    expect(JSON.parse(sent[2] ?? 'null').type).toBe('move');

    // A right click on a player opens the duel menu and sends nothing; picking Duel sends the request.
    board.click({ x: 600, y: 420, button: 2 });
    expect(sent).toHaveLength(3);
    board.requestDuel('fig-other');
    expect(JSON.parse(sent[3] ?? 'null')).toEqual({ type: 'duel_request', playerId: 'fig-other' });
    expect(board.duelPending()).toBe('fig-other');
    board.cancelDuelRequest();
    expect(JSON.parse(sent[4] ?? 'null')).toEqual({ type: 'duel_cancel', playerId: 'fig-other' });
    expect(board.duelPending()).toBeNull();
    // A left click beside the player only walks.
    board.click({ x: 630, y: 420, button: 0 });
    expect(JSON.parse(sent[5] ?? 'null').type).toBe('move');

    const shown = feet(board.pose(), 'player', 'fig-self');
    expect(shown.x).toBe(400);
    expect(board.camera()).toEqual(viewBox('town', shown.x, shown.y, board.zoom()));
    const bubble = board.controls().find((row) => row.id === 'bubble');
    expect(bubble).toEqual(townControls(board.camera()).find((row) => row.id === 'bubble'));
    // The camera follows the displayed feet (x 400), not the server's latest position (x 430).
    expect(Math.abs(board.camera().x - viewBox('town', 430, 440, board.zoom()).x)).toBeGreaterThan(1);

    const coin = feet(board.pose(), 'coin', 'seed');
    expect(coin).toMatchObject({ x: 450, y: 460 });
    const screen = mapToCanvas(board.camera(), coin.x, coin.y);
    const back = canvasToMap(board.camera(), screen.x, screen.y);
    expect(back.x).toBeCloseTo(coin.x, 5);
    expect(back.y).toBeCloseTo(coin.y, 5);
    const lagged = beetSpriteRect(500, 400, 'wolf', '/avatars/wolf/stand.png');
    expect(lagged.x + lagged.width).toBeLessThan(530);
  });
});

function chaseFrames(frameMs: number, framesPerSnap: number, ticks: number): void {
  const rig = openLoop();
  const playerX0 = 400;
  const wolfX0 = 700;
  const y = 440;
  rig.board.ingest(mango([figAt('fig-self', playerX0, y)], [wolfAt(wolfX0, y)]));
  let time = 1000;
  rig.pump(time);
  let player = feet(rig.board.pose(), 'player', 'fig-self');
  let wolf = feet(rig.board.pose(), 'monster', 'beet-wolf');
  expect(player).toMatchObject({ x: playerX0, y });
  expect(wolf).toMatchObject({ x: wolfX0, y });

  for (let tick = 0; tick < ticks; tick += 1) {
    rig.board.ingest(mango(
      [figAt('fig-self', playerX0 + (tick + 1) * (FIG_PACE * 0.1), y, 'right', true)],
      [wolfAt(wolfX0 + (tick + 1) * (BEET_PACE * 0.1), y)],
    ));
    for (let frame = 1; frame <= framesPerSnap; frame += 1) {
      const nextTime = 1000 + tick * 100 + frame * frameMs;
      const dt = (nextTime - time) / 1000;
      time = nextTime;
      const before = rig.paints.length;
      rig.pump(time);
      expect(rig.paints.length).toBe(before + 1);
      const nextPlayer = feet(rig.board.pose(), 'player', 'fig-self');
      const nextWolf = feet(rig.board.pose(), 'monster', 'beet-wolf');
      const paintedPlayer = feet(rig.paints[rig.paints.length - 1] ?? [], 'player', 'fig-self');
      expect(paintedPlayer.x).toBeCloseTo(nextPlayer.x, 6);
      const playerStep = dist(player, nextPlayer);
      const wolfStep = dist(wolf, nextWolf);
      expect(playerStep).toBeGreaterThan(0);
      expect(wolfStep).toBeGreaterThan(0);
      expect(playerStep).toBeLessThan(FIG_PACE * dt * 1.25);
      expect(wolfStep).toBeLessThan(BEET_PACE * dt * 1.25);
      player = nextPlayer;
      wolf = nextWolf;
    }
  }
  rig.stop();
  expect(rig.queued()).toBe(false);
}

describe('papaya frames between snapshots', () => {
  it('moves the displayed fig and beet on every 16 ms frame, under the pace cap', () => {
    chaseFrames(16, 6, 5);
  });

  it('moves the displayed fig and beet on every 33 ms frame, under the pace cap', () => {
    chaseFrames(33, 3, 4);
  });

  it('does not paint a frame that would look the same', () => {
    const rig = openLoop();
    rig.board.ingest(mango([figAt('fig-self', 300, 440)]));
    rig.pump(1000);
    const painted = rig.paints.length;
    expect(painted).toBeGreaterThan(0);
    rig.pump(1016);
    rig.pump(1032);
    rig.pump(1048);
    expect(rig.paints.length).toBe(painted);
    rig.stop();
  });

  it('redraws hit numbers and coin floats on each frame while they are alive', () => {
    const rig = openLoop();
    let clock = 8_000_000;
    const dateNow = Date.now;
    Date.now = () => clock;
    try {
      const players = [figAt('fig-self', 400, 400)];
      const coin = { id: 'coin-mine', ownerId: 'fig-self', x: 420, y: 380, value: 7 };
      rig.board.ingest({
        type: 'snapshot',
        character: { id: 'fig-self', place: 'town', gender: 'woman' },
        snapshot: { players, monsters: [], coins: [coin], pickups: [] },
      });
      rig.pump(5000);
      const quiet = rig.paints.length;
      rig.board.ingest({
        type: 'snapshot',
        character: { id: 'fig-self', place: 'town', gender: 'woman' },
        snapshot: {
          players,
          monsters: [],
          coins: [],
          pickups: [],
          hits: [{ id: 'hit-1', targetKind: 'monster', targetId: 'beet-wolf', amount: 4, x: coin.x, y: coin.y }],
        },
      });
      let time = 5000;
      let paints = quiet;
      for (let elapsed = 0; elapsed < 1000; elapsed += 16) {
        clock = 8_000_000 + elapsed;
        time += 16;
        rig.pump(time);
        expect(rig.paints.length).toBe(paints + 1);
        paints = rig.paints.length;
        expect(rig.board.damageNumbers(clock).length).toBeGreaterThan(0);
      }
      const risen = rig.board.damageNumbers(8_000_000 + 500);
      const gold = risen.find((row) => row.id === 'melon:coin-mine');
      const wound = risen.find((row) => row.id === 'hit-1');
      expect(gold?.text).toBe('+7');
      expect(wound?.text).toBe('4');
      expect(gold && wound && gold.y < wound.y + 36).toBe(true);
      clock = 8_000_000 + 1000;
      time += 16;
      rig.pump(time);
      expect(rig.board.damageNumbers(clock)).toEqual([]);
      const cleared = rig.paints.length;
      time += 16;
      rig.pump(time);
      expect(rig.paints.length).toBe(cleared);
    } finally {
      Date.now = dateNow;
      rig.stop();
    }
  });

  it('keeps the swing still while the feet glide, and does not burn it per frame', () => {
    const rig = openLoop();
    const wolf = wolfAt(500, 400);
    rig.board.ingest(mango([figAt('fig-self', 200, 440)], [wolf]));
    rig.pump(1000);
    rig.board.click({ x: 500, y: 400, button: 0 });
    expect(feet(rig.board.draw(), 'player', 'fig-self').still).toBe('attack-1');
    rig.board.ingest(mango([figAt('fig-self', 212, 440, 'right', true)], [wolf]));
    let time = 1000;
    let previous = feet(rig.board.pose(), 'player', 'fig-self').x;
    for (let frame = 0; frame < 4; frame += 1) {
      time += 16;
      rig.pump(time);
      const shown = feet(rig.board.pose(), 'player', 'fig-self');
      expect(shown.still).toBe('attack-1');
      expect(shown.x).toBeGreaterThan(previous);
      previous = shown.x;
    }
    expect(feet(rig.board.draw(), 'player', 'fig-self').still).toBe('attack-2');
    rig.stop();
  });

  it('stops when the screen is hidden and does not leave a frame queued', () => {
    const rig = openLoop();
    rig.board.ingest(mango([figAt('fig-self', 300, 440)]));
    rig.pump(1000);
    expect(rig.queued()).toBe(true);
    rig.visible.value = false;
    const painted = rig.paints.length;
    rig.pump(1016);
    expect(rig.paints.length).toBe(painted);
    expect(rig.queued()).toBe(false);
    rig.visible.value = true;
    rig.stop();
  });
});

describe('game screen loop', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('paints between snapshots and stops when the canvas or the page is hidden', () => {
    const clears = { n: 0 };
    let queued: { id: number; cb: (timeMs: number) => void } | null = null;
    let seq = 1;
    const requestAnimationFrame = (cb: (timeMs: number) => void) => {
      const id = seq;
      seq += 1;
      queued = { id, cb };
      return id;
    };
    const cancelAnimationFrame = (id: number) => {
      if (queued?.id === id) queued = null;
    };
    const pump = (timeMs: number) => {
      const job = queued;
      if (job === null) throw new Error('no papaya frame queued');
      queued = null;
      job.cb(timeMs);
    };

    const canvas = {
      id: 'papaya-canvas',
      hidden: false,
      width: 1280,
      height: 720,
      listeners: {} as Record<string, Array<(event: { button?: number; clientX?: number; clientY?: number; target?: unknown; preventDefault?: () => void }) => void>>,
      addEventListener(type: string, listener: (event: { button?: number }) => void) {
        (canvas.listeners[type] ??= []).push(listener);
      },
      getContext() {
        return {
          fillStyle: '',
          font: '',
          shadowColor: '',
          shadowBlur: 0,
          clearRect() {
            clears.n += 1;
          },
          fillRect() {},
          fillText() {},
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
        };
      },
      getBoundingClientRect() {
        return { left: 0, top: 0, width: 1280, height: 720 };
      },
    };

    const listeners: Record<string, Array<() => void>> = {};
    const doc = {
      hidden: false,
      getElementById(id: string) {
        return id === 'papaya-canvas' ? canvas : null;
      },
      createElement() {
        return { width: 0, height: 0, getContext: () => null };
      },
      addEventListener(type: string, listener: () => void) {
        (listeners[type] ??= []).push(listener);
      },
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
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrame);
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame);

    sproutAfterLogin(doc as unknown as Document, { id: 'fig-self', place: 'town', gender: 'woman' });
    expect(queued).not.toBeNull();

    const spot = (x: number) => ({
      type: 'snapshot',
      character: { id: 'fig-self', place: 'town', gender: 'woman' },
      snapshot: {
        players: [figAt('fig-self', x, 440)],
        monsters: [],
        coins: [],
        pickups: [],
      },
    });
    FakeSocket.latest?.deliver(spot(300));

    let time = 2000;
    let guard = 0;
    let previous = -1;
    while (clears.n !== previous && guard < 8) {
      previous = clears.n;
      pump(time);
      time += 16;
      guard += 1;
    }
    expect(clears.n).toBe(previous);
    const settled = clears.n;
    pump(time);
    time += 16;
    expect(clears.n).toBe(settled);

    FakeSocket.latest?.deliver(spot(312));
    for (let frame = 0; frame < 4; frame += 1) {
      const before = clears.n;
      pump(time);
      time += 16;
      expect(clears.n).toBe(before + 1);
    }

    canvas.hidden = true;
    const frozen = clears.n;
    pump(time);
    time += 16;
    expect(clears.n).toBe(frozen);
    expect(queued).toBeNull();

    canvas.hidden = false;
    for (const listener of listeners.visibilitychange ?? []) listener();
    expect(queued).not.toBeNull();

    doc.hidden = true;
    pump(time);
    expect(queued).toBeNull();
    expect(clears.n).toBe(frozen);
  });
});
