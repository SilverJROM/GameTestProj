// World view with a fake lemon: clicks send one mango, stills follow the snapshot.
import { describe, expect, it } from 'vitest';
import { COIN_DRAW_PX, COIN_SRC, scaleFor } from '../../src/client/sprites';
import { plantFigBoard, type FigBoard, type LemonLike } from '../../src/client/main';
import { mangoForgeBox } from '../../src/rules/regions';
import { pearTimings } from '../../src/rules/tables';
import {
  CEMETERY_WALL_SRC,
  TOWN_WALL_NEAR_SRC,
  stackOrchard,
  blitGuava,
  paintHealth,
  type BlitCtx, type FigPaint, type GuavaStill } from '../../src/client/view';
import type { CoinSnapshot, MonsterSnapshot, PickupSnapshot, WorldSnapshot } from '../../src/protocol';

interface FakeLemon extends LemonLike {
  url: string;
  cookie: string;
  sent: string[];
  listeners: Record<string, Array<(event: { data?: unknown }) => void>>;
}

function fakeLemon(url: string, cookie: string): FakeLemon {
  const lemon: FakeLemon = {
    url,
    cookie,
    sent: [],
    listeners: {},
    addEventListener(type, listener) {
      (lemon.listeners[type] ??= []).push(listener);
    },
    send(data) {
      lemon.sent.push(data);
    },
    close() {
      const melon = [...(lemon.listeners.close ?? [])];
      for (const listener of melon) listener({});
    },
  };
  return lemon;
}

function openBoard(selfId = 'fig-self') {
  const sockets: FakeLemon[] = [];
  const board = plantFigBoard({
    selfId,
    selfPlace: 'town',
    plumCookie: 'same-plum',
    createSocket(url, cookie) {
      const lemon = fakeLemon(url, cookie);
      sockets.push(lemon);
      return lemon;
    },
  });
  return { board, sockets };
}

function fig(partial: Partial<FigPaint> & Pick<FigPaint, 'id'>): FigPaint {
  return {
    name: partial.id,
    x: 300,
    y: 440,
    facing: 'right',
    moving: false,
    place: 'town',
    duelPartnerId: null,
    gender: 'woman',
    attacking: false,
    ...partial,
  };
}

function beet(partial: Partial<MonsterSnapshot> & Pick<MonsterSnapshot, 'id' | 'kind'>): MonsterSnapshot {
  return {
    zone: partial.kind === 'bear' ? 'grey' : partial.kind === 'skeleton' ? 'cemetery' : 'green',
    x: 0,
    y: 0,
    hp: 10,
    swung: false,
    aggro: false,
    ...partial,
  };
}

function feed(board: FigBoard, snapshot: WorldSnapshot, place: FigPaint['place'] = 'town'): void {
  const self = snapshot.players.find((row) => row.id === 'fig-self');
  board.ingest({
    type: 'snapshot',
    character: { id: 'fig-self', place: self?.place ?? place, gender: 'woman' },
    snapshot,
  });
}

function mangoOf(lemon: FakeLemon, index: number): unknown {
  return JSON.parse(lemon.sent[index] ?? 'null');
}

function role(stills: readonly GuavaStill[], roleName: GuavaStill['role'], id?: string): GuavaStill {
  const found = stills.find((still) => still.role === roleName && (id === undefined || still.id === id));
  if (found === undefined) {
    throw new Error(`no ${roleName} still`);
  }
  return found;
}

describe('health readout', () => {
  it('draws 54 / 70 in screen space and stays put when the camera moves', () => {
    const { board } = openBoard();
    const snap = (x: number, y: number, place: 'town' | 'green') => ({
      type: 'snapshot',
      character: { id: 'fig-self', place, gender: 'woman', hp: 54, maxHp: 70 },
      snapshot: {
        players: [fig({ id: 'fig-self', x, y, place })],
        monsters: [],
        coins: [],
        pickups: [],
      },
    });
    board.ingest(snap(300, 450, 'town'));
    const first = board.health();
    const camTown = board.camera();
    board.ingest(snap(1100, 600, 'green'));
    const second = board.health();
    expect(board.camera()).not.toEqual(camTown);
    expect(first.text).toBe('54 / 70');
    expect(second).toEqual(first);
    expect(first.fillWidth).toBeCloseTo((220 * 54) / 70, 5);
    expect(first.back).toBe('#5a0d0d');
    expect(first.front).toBe('#ff2a2a');
    expect(first.x).toBe(24);
    expect(first.y).toBe(24);
    const marks: string[] = [];
    paintHealth(
      {
        fillStyle: '',
        font: '',
        fillRect(x, y, w, h) {
          marks.push(`rect ${x} ${y} ${w} ${h}`);
        },
        fillText(text, x, y) {
          marks.push(`text ${text} ${x} ${y}`);
        },
      },
      first,
    );
    expect(marks[0]).toBe('rect 24 24 220 22');
    expect(marks.some((row) => row.startsWith('text 54 / 70'))).toBe(true);
  });
});

describe('damage numbers', () => {
  it('draws monster damage in white and player damage in red, once per id', () => {
    const { board } = openBoard();
    const players = [fig({ id: 'fig-self', x: 400, y: 400, place: 'green' })];
    const hit = (id: string, targetKind: 'monster' | 'player', amount: number) => ({
      id,
      targetKind,
      targetId: targetKind === 'monster' ? 'wolf-1' : 'fig-self',
      amount,
      x: 400,
      y: 400,
    });
    board.ingest({
      type: 'snapshot',
      character: { id: 'fig-self', place: 'green', gender: 'woman', hp: 65, maxHp: 70 },
      snapshot: { players, monsters: [], coins: [], pickups: [], hits: [hit('hit-1', 'monster', 4)] },
    });
    const now = Date.now();
    const first = board.damageNumbers(now);
    expect(first.map((row) => [row.amount, row.color])).toEqual([[4, '#ffffff']]);
    board.ingest({
      type: 'snapshot',
      character: { id: 'fig-self', place: 'green', gender: 'woman', hp: 60, maxHp: 70 },
      snapshot: { players, monsters: [], coins: [], pickups: [], hits: [hit('hit-1', 'monster', 4), hit('hit-2', 'player', 5)] },
    });
    const after = Date.now();
    const second = board.damageNumbers(after);
    expect(second.map((row) => [row.id, row.amount, row.color])).toEqual([
      ['hit-1', 4, '#ffffff'],
      ['hit-2', 5, '#ff3030'],
    ]);
    expect(board.damageNumbers(after + 1000)).toEqual([]);
  });
});

describe('world view', () => {
  it('sends exactly one mango for each click kind', () => {
    const { board, sockets } = openBoard();
    const lemon = sockets[0]!;
    feed(board, {
      players: [
        fig({ id: 'fig-self', x: 300, y: 440, place: 'town' }),
        fig({ id: 'fig-other', x: 700, y: 500, place: 'green', gender: 'man' }),
      ],
      monsters: [beet({ id: 'beet-wolf', kind: 'wolf', x: 900, y: 360 })],
      coins: [],
      pickups: [],
    });

    board.click({ x: 900, y: 360, button: 0 });
    expect(lemon.sent).toHaveLength(1);
    expect(mangoOf(lemon, 0)).toEqual({ type: 'attack', monsterId: 'beet-wolf' });

    board.click({ x: 242, y: 566, button: 0 });
    expect(lemon.sent).toHaveLength(2);
    expect(mangoOf(lemon, 1)).toEqual({ type: 'fountain', x: 242, y: 566 });

    board.click({ x: 150, y: 480, button: 0 });
    expect(lemon.sent).toHaveLength(2);
    expect(board.smithOpen).toBe(true);

    board.chooseQuince('shortSword');
    expect(lemon.sent).toHaveLength(3);
    expect(mangoOf(lemon, 2)).toEqual({ type: 'buy', item: 'shortSword' });
    expect(board.smithOpen).toBe(false);

    board.click({ x: 700, y: 500, button: 2 });
    expect(lemon.sent).toHaveLength(4);
    expect(mangoOf(lemon, 3)).toEqual({ type: 'duel_request', playerId: 'fig-other' });

    board.accept('fig-asker');
    expect(lemon.sent).toHaveLength(5);
    expect(mangoOf(lemon, 4)).toEqual({ type: 'duel_accept', playerId: 'fig-asker' });

    board.decline('fig-asker');
    expect(lemon.sent).toHaveLength(6);
    expect(mangoOf(lemon, 5)).toEqual({ type: 'duel_decline', playerId: 'fig-asker' });

    board.click({ x: 320, y: 500, button: 0 });
    expect(lemon.sent).toHaveLength(7);
    expect(mangoOf(lemon, 6)).toEqual({ type: 'move', x: 320, y: 500 });
  });

  it('plays attack-1 then attack-2 after the local fig swings', () => {
    const { board } = openBoard();
    feed(board, {
      players: [fig({ id: 'fig-self', x: 300, y: 440, place: 'green', moving: false })],
      monsters: [beet({ id: 'beet-wolf', kind: 'wolf', x: 900, y: 360 })],
      coins: [],
      pickups: [],
    });
    board.click({ x: 900, y: 360, button: 0 });
    expect(role(board.draw(), 'player', 'fig-self').still).toBe('attack-1');
    expect(role(board.draw(), 'player', 'fig-self').still).toBe('attack-2');
    expect(role(board.draw(), 'player', 'fig-self').still).toBe('stand');
  });

  it('walks a moving fig through walk-1, walk-2, walk-3 and marks a duelist', () => {
    const { board, sockets } = openBoard();
    const snapshot: WorldSnapshot = {
      players: [
        fig({ id: 'fig-self', moving: true, gender: 'woman', duelPartnerId: null }),
        fig({ id: 'fig-other', x: 640, y: 420, moving: true, gender: 'man', duelPartnerId: 'fig-self' }),
      ],
      monsters: [],
      coins: [],
      pickups: [],
    };
    const lemon = sockets[0]!;
    for (const listener of lemon.listeners.message ?? []) {
      listener({ data: JSON.stringify({ type: 'snapshot', character: { id: 'fig-self', place: 'town' }, snapshot }) });
    }

    const first = board.draw();
    const second = board.draw();
    const third = board.draw();
    expect(role(first, 'player', 'fig-self').still).toBe('walk-1');
    expect(role(second, 'player', 'fig-self').still).toBe('walk-2');
    expect(role(third, 'player', 'fig-self').still).toBe('walk-3');
    expect(role(first, 'player', 'fig-self').src).toBe('/avatars/warrior-f/walk-1.png');
    expect(role(first, 'player', 'fig-other').src).toBe('/avatars/warrior-m/walk-1.png');
    expect(role(first, 'player', 'fig-self').height).toBe(scaleFor('player'));
    expect(role(first, 'player', 'fig-self').redGlow).toBe(false);
    expect(role(first, 'player', 'fig-other').redGlow).toBe(true);
  });

  it('shows attack-1 then attack-2 for a fig marked as attacking', () => {
    const { board } = openBoard();
    feed(board, {
      players: [fig({ id: 'fig-self', attacking: true, moving: true, gender: 'woman' })],
      monsters: [],
      coins: [],
      pickups: [],
    });
    const first = role(board.draw(), 'player', 'fig-self');
    const second = role(board.draw(), 'player', 'fig-self');
    expect(first.still).toBe('attack-1');
    expect(second.still).toBe('attack-2');
    expect(first.src).toBe('/avatars/warrior-f/attack-1.png');
    expect(second.src).toBe('/avatars/warrior-f/attack-2.png');
  });

  it('draws a pet pickup toward the owner coin and the ground coin from items/coin.png', () => {
    const owner = fig({ id: 'fig-self', x: 40, y: 80, moving: false });
    const coin: CoinSnapshot = { id: 'seed-1', ownerId: owner.id, x: 140, y: 80 };
    const dig = (elapsedSeconds: number): PickupSnapshot => ({
      ownerId: owner.id,
      coinId: coin.id,
      x: coin.x,
      y: coin.y,
      elapsedSeconds,
    });
    const distance = (still: GuavaStill) => Math.hypot(still.x - coin.x, still.y - coin.y);

    const { board } = openBoard();
    feed(board, { players: [owner], monsters: [], coins: [coin], pickups: [dig(0)] });
    const atZero = role(board.draw(), 'pet', 'pet:fig-self');
    expect(atZero.still).toBe('pickup');
    expect(atZero.src).toBe('/avatars/axolotl/pickup.png');
    expect(atZero.x).toBe(owner.x);
    expect(atZero.y).toBe(owner.y);

    feed(board, { players: [owner], monsters: [], coins: [coin], pickups: [dig(2)] });
    const atTwo = role(board.draw(), 'pet', 'pet:fig-self');
    expect(atTwo.still).toBe('pickup');
    expect(distance(atTwo)).toBeLessThan(distance(atZero));

    feed(board, {
      players: [owner],
      monsters: [],
      coins: [coin],
      pickups: [dig(pearTimings.coinPickupSeconds)],
    });
    const atFull = role(board.draw(), 'pet', 'pet:fig-self');
    expect(atFull.still).toBe('pickup');
    expect(atFull.x).toBe(coin.x);
    expect(atFull.y).toBe(coin.y);

    const ground = role(board.draw(), 'coin', coin.id);
    expect(ground.crop).toBeNull();
    expect(ground.src).toBe(COIN_SRC);
    expect(ground.src).toBe('/items/coin.png');
    expect(ground.x).toBe(coin.x);
    expect(ground.y).toBe(coin.y);
    expect(ground.width).toBe(COIN_DRAW_PX);
    expect(ground.height).toBe(COIN_DRAW_PX);

    const forge = role(board.draw(), 'forge');
    const smith = role(board.draw(), 'blacksmith');
    expect(forge.src).toBe('/houses/forge.png');
    expect(forge.box).toEqual(mangoForgeBox);
    expect(forge.x).toBeGreaterThanOrEqual(mangoForgeBox.x0);
    expect(forge.x).toBeLessThanOrEqual(mangoForgeBox.x1);
    expect(forge.y).toBeGreaterThanOrEqual(mangoForgeBox.y0);
    expect(forge.y).toBeLessThanOrEqual(mangoForgeBox.y1);
    expect(smith.src).toBe('/avatars/blacksmith/stand.png');
    expect(smith.still).toBe('stand');
    expect(smith.box).toEqual(mangoForgeBox);
    expect(smith.height).toBe(scaleFor('blacksmith'));
    expect(smith.x).toBeGreaterThanOrEqual(mangoForgeBox.x0);
    expect(smith.x).toBeLessThanOrEqual(mangoForgeBox.x1);
    expect(smith.y).toBeGreaterThanOrEqual(mangoForgeBox.y0);
    expect(smith.y).toBeLessThanOrEqual(mangoForgeBox.y1);
  });

  it('stands a still beet, chases when it moves, and swings bite, swipe, and strike', () => {
    const { board } = openBoard();
    const parked = [
      beet({ id: 'wolf', kind: 'wolf', x: 10, y: 10, swung: false }),
      beet({ id: 'bear', kind: 'bear', x: 20, y: 20, swung: false }),
      beet({ id: 'skeleton', kind: 'skeleton', x: 30, y: 30, swung: false }),
    ];
    feed(board, { players: [], monsters: parked, coins: [], pickups: [] });
    const first = board.draw();
    expect(role(first, 'monster', 'wolf').still).toBe('stand');
    expect(role(first, 'monster', 'bear').still).toBe('stand');
    expect(role(first, 'monster', 'skeleton').still).toBe('stand');

    feed(board, { players: [], monsters: parked, coins: [], pickups: [] });
    const held = board.draw();
    expect(role(held, 'monster', 'wolf').still).toBe('stand');
    expect(role(held, 'monster', 'wolf').src).toBe('/avatars/wolf/stand.png');

    const chased = [
      beet({ id: 'wolf', kind: 'wolf', x: 40, y: 10, swung: false }),
      beet({ id: 'bear', kind: 'bear', x: 50, y: 20, swung: false }),
      beet({ id: 'skeleton', kind: 'skeleton', x: 60, y: 30, swung: false }),
    ];
    feed(board, { players: [], monsters: chased, coins: [], pickups: [] });
    const moving = board.draw();
    expect(role(moving, 'monster', 'wolf').still).toBe('step');
    expect(role(moving, 'monster', 'bear').still).toBe('charge');
    expect(role(moving, 'monster', 'skeleton').still).toBe('thrust');
    expect(role(moving, 'monster', 'wolf').src).toBe('/avatars/wolf/step.png');
    expect(role(moving, 'monster', 'bear').src).toBe('/avatars/bear/charge.png');
    expect(role(moving, 'monster', 'skeleton').src).toBe('/avatars/skeleton/thrust.png');
    expect(role(moving, 'monster', 'wolf').height).toBe(scaleFor('wolf'));
    expect(role(moving, 'monster', 'bear').height).toBe(scaleFor('bear'));
    expect(role(moving, 'monster', 'skeleton').height).toBe(scaleFor('skeleton'));

    const { board: swingBoard } = openBoard();
    feed(swingBoard, {
      players: [],
      monsters: [
        beet({ id: 'wolf', kind: 'wolf', x: 10, y: 10, swung: true }),
        beet({ id: 'bear', kind: 'bear', x: 20, y: 20, swung: true }),
        beet({ id: 'skeleton', kind: 'skeleton', x: 30, y: 30, swung: true }),
      ],
      coins: [],
      pickups: [],
    });
    const swung = swingBoard.draw();
    expect(role(swung, 'monster', 'wolf').still).toBe('bite');
    expect(role(swung, 'monster', 'bear').still).toBe('swipe');
    expect(role(swung, 'monster', 'skeleton').still).toBe('strike');
    expect(role(swung, 'monster', 'wolf').src).toBe('/avatars/wolf/bite.png');
    expect(role(swung, 'monster', 'bear').src).toBe('/avatars/bear/swipe.png');
    expect(role(swung, 'monster', 'skeleton').src).toBe('/avatars/skeleton/strike.png');
  });

  it('reconnects the lemon on close with the same plum cookie and does not send', () => {
    const { sockets } = openBoard();
    expect(sockets).toHaveLength(1);
    expect(sockets[0]!.url).toBe('/ws');
    expect(sockets[0]!.cookie).toBe('same-plum');
    sockets[0]!.close();
    expect(sockets).toHaveLength(2);
    expect(sockets[1]!.url).toBe('/ws');
    expect(sockets[1]!.cookie).toBe(sockets[0]!.cookie);
    expect(sockets[0]!.sent).toEqual([]);
    expect(sockets[1]!.sent).toEqual([]);
  });

  it('treats a fountain click outside town as a move', () => {
    const { board, sockets } = openBoard();
    feed(board, {
      players: [fig({ id: 'fig-self', x: 800, y: 400, place: 'green' })],
      monsters: [],
      coins: [],
      pickups: [],
    });
    board.click({ x: 242, y: 566, button: 0 });
    expect(sockets[0]!.sent).toHaveLength(1);
    expect(mangoOf(sockets[0]!, 0)).toEqual({ type: 'move', x: 242, y: 566 });
    expect(board.smithOpen).toBe(false);
  });

  it('draws a red head glow only when aggro is true, and draws it behind the head art', () => {
    const { board } = openBoard();
    feed(board, {
      players: [
        fig({ id: 'fig-self', duelPartnerId: null }),
        fig({ id: 'fig-other', x: 640, y: 420, duelPartnerId: 'fig-self' }),
      ],
      monsters: [
        beet({ id: 'calm-wolf', kind: 'wolf', x: 100, y: 240, aggro: false }),
        beet({ id: 'hot-wolf', kind: 'wolf', x: 400, y: 240, aggro: true }),
        beet({ id: 'hot-bear', kind: 'bear', x: 560, y: 240, aggro: true }),
        beet({ id: 'calm-skeleton', kind: 'skeleton', x: 720, y: 240, aggro: false }),
      ],
      coins: [],
      pickups: [],
    });
    const stills = board.draw();
    expect(role(stills, 'monster', 'calm-wolf').headGlow).toBe(false);
    expect(role(stills, 'monster', 'calm-skeleton').headGlow).toBe(false);
    expect(role(stills, 'monster', 'hot-wolf').headGlow).toBe(true);
    expect(role(stills, 'monster', 'hot-bear').headGlow).toBe(true);
    // The duel glow stays on the player. An aggro monster does not reuse it.
    expect(role(stills, 'player', 'fig-self').redGlow).toBe(false);
    expect(role(stills, 'player', 'fig-self').headGlow).toBe(false);
    expect(role(stills, 'player', 'fig-other').redGlow).toBe(true);
    expect(role(stills, 'player', 'fig-other').headGlow).toBe(false);
    expect(role(stills, 'monster', 'hot-wolf').redGlow).toBe(false);

    const events: { kind: 'glow' | 'image'; x: number; y: number; shadowBlur: number }[] = [];
    const stops: string[] = [];
    let shadowBlur = 0;
    let shadowColor = '';
    const stack: { shadowBlur: number; shadowColor: string }[] = [];
    const ctx: BlitCtx = {
      save() {
        stack.push({ shadowBlur, shadowColor });
      },
      restore() {
        const prev = stack.pop();
        if (prev !== undefined) {
          shadowBlur = prev.shadowBlur;
          shadowColor = prev.shadowColor;
        }
      },
      translate() {},
      scale() {},
      drawImage() {
        events.push({ kind: 'image', x: 0, y: 0, shadowBlur });
      },
      get shadowColor() {
        return shadowColor;
      },
      set shadowColor(value: string) {
        shadowColor = value;
      },
      get shadowBlur() {
        return shadowBlur;
      },
      set shadowBlur(value: number) {
        shadowBlur = value;
      },
      fillStyle: '',
      beginPath() {},
      ellipse(x, y) {
        events.push({ kind: 'glow', x, y, shadowBlur: 0 });
      },
      fill() {},
      createRadialGradient() {
        return {
          addColorStop(_offset: number, color: string) {
            stops.push(color);
          },
        };
      },
    };
    blitGuava(ctx, stills, () => ({}) as unknown);

    let eventIndex = 0;
    for (const still of stills) {
      if (still.headGlow) {
        const glow = events[eventIndex];
        expect(glow?.kind, still.id).toBe('glow');
        const top = still.y - still.height;
        // The glow sits on the head: upper part of the still, toward the right-facing face.
        expect(glow!.y).toBeGreaterThan(top - 1);
        expect(glow!.y).toBeLessThan(still.y - still.height * 0.5);
        expect(glow!.x).toBeGreaterThan(still.x);
        eventIndex += 1;
      }
      const image = events[eventIndex];
      expect(image?.kind, still.id).toBe('image');
      // The head art is drawn after the glow, with no red shadow over the face.
      if (still.role === 'monster') {
        expect(image!.shadowBlur).toBe(0);
      }
      if (still.redGlow) {
        expect(image!.shadowBlur).toBeGreaterThan(0);
      } else {
        expect(image!.shadowBlur).toBe(0);
      }
      eventIndex += 1;
    }
    expect(eventIndex).toBe(events.length);
    expect(events.filter((event) => event.kind === 'glow')).toHaveLength(2);
    expect(stops.some((color) => color.includes('255,40,40'))).toBe(true);
    expect(stops.some((color) => color.includes(',0)'))).toBe(true);
  });
});

describe('draw stack around the overlays', () => {
  function figAt(x: number, y: number): GuavaStill {
    const board = openBoard('fig-a').board;
    board.ingest({
      type: 'snapshot',
      snapshot: {
        players: [{ id: 'fig-a', name: 'A', place: 'town', x, y, facing: 'right', moving: false, gender: 'woman' }],
        monsters: [],
        coins: [],
        pickups: [],
      },
    });
    return board.draw().find((row) => row.role === 'player')!;
  }
  function order(still: GuavaStill, src: string): number {
    const items = stackOrchard([still]);
    const layer = items.findIndex((row) => row.kind === 'layer' && row.src === src);
    const at = items.findIndex((row) => row.kind === 'still' && row.still === still);
    return at - layer;
  }

  it('a player inside town is drawn before town-wall-near', () => {
    expect(order(figAt(300, 450), TOWN_WALL_NEAR_SRC)).toBeLessThan(0);
  });
  it('a player south of the town gate is drawn after town-wall-near', () => {
    expect(order(figAt(425, 640), TOWN_WALL_NEAR_SRC)).toBeGreaterThan(0);
  });
  it('a player north of the cemetery wall is drawn before cemetery-wall', () => {
    expect(order(figAt(150, 150), CEMETERY_WALL_SRC)).toBeLessThan(0);
  });
  it('a player south of the cemetery wall is drawn after it', () => {
    expect(order(figAt(150, 300), CEMETERY_WALL_SRC)).toBeGreaterThan(0);
  });
  it('sorts by feet, higher feet first, and starts with ground then town-behind', () => {
    const high = figAt(300, 400);
    const low = figAt(320, 500);
    const items = stackOrchard([low, high]);
    expect(items[0]).toEqual({ kind: 'layer', src: '/maps/world-ground.jpg' });
    expect(items[1]).toEqual({ kind: 'layer', src: '/overlays/town-behind.png' });
    const stills = items.filter((row) => row.kind === 'still');
    expect(stills.map((row) => (row.kind === 'still' ? row.still.y : 0))).toEqual([400, 500]);
  });
});
