// World view with a fake lemon: clicks send one mango, stills follow the snapshot.
import { describe, expect, it } from 'vitest';
import { mapToCanvas } from '../../src/client/camera';
import { COIN_DRAW_PX, COIN_SRC, scaleFor } from '../../src/client/sprites';
import { plantFigBoard, type FigBoard, type LemonLike } from '../../src/client/main';
import { mangoForgeBox } from '../../src/rules/regions';
import { mangoGearRows, onionMonsterRows, pearTimings } from '../../src/rules/tables';
import {
  BEET_PAD_PX,
  CEMETERY_WALL_SRC,
  HEALTH_BAR_H,
  HEALTH_X,
  HEALTH_Y,
  LIME_BUBBLE_FONT,
  LIME_BUBBLE_H,
  LIME_BUBBLE_W,
  SMITH_X,
  SMITH_Y,
  beetSpriteRect,
  bagTiles,
  coinExpiryText,
  coinExpiryTip,
  inventorySheet,
  figStandSrc,
  kiwiSliderBox,
  oliveDragFace,
  oliveDrop,
  oliveHint,
  olivePanelBox,
  papayaRectsOverlap,
  TOWN_WALL_NEAR_SRC,
  hudReadout,
  shopSheet,
  stackOrchard,
  blitGuava,
  paintHealth,
  paintHud,
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

describe('hud readout', () => {
  it('formats a level 1 start, a mid level, and the level cap', () => {
    expect(hudReadout({ level: 1, xp: 0, coins: 0 }).lines).toEqual(['Lv 1', 'XP 0 / 200', 'Coins 0']);
    expect(hudReadout({ level: 3, xp: 7, coins: 12 }).lines).toEqual(['Lv 3', 'XP 7 / 900', 'Coins 12']);
    const cap = hudReadout({ level: 6, xp: 40, coins: 3 });
    expect(cap.lines).toEqual(['Lv 6', 'XP 40', 'Coins 3']);
    expect(cap.lines[1]).not.toContain('/');
  });

  it('paints those lines under the health bar in the same ink and type', () => {
    const row = hudReadout({ level: 1, xp: 0, coins: 0 });
    expect(row.x).toBe(HEALTH_X);
    expect(row.y).toBeGreaterThan(HEALTH_Y + HEALTH_BAR_H);
    const marks: string[] = [];
    const ctx = {
      fillStyle: '',
      font: '',
      fillRect() {},
      fillText(text: string, x: number, y: number) {
        marks.push(`${text} ${x} ${y} ${ctx.font} ${ctx.fillStyle}`);
      },
    };
    paintHud(ctx, row);
    expect(marks).toEqual([
      `Lv 1 ${row.x} ${row.y} 700 20px Georgia, serif #ffffff`,
      `XP 0 / 200 ${row.x} ${row.y + row.lineGap} 700 20px Georgia, serif #ffffff`,
      `Coins 0 ${row.x} ${row.y + row.lineGap * 2} 700 20px Georgia, serif #ffffff`,
    ]);
  });

  it('follows the latest snapshot on the board', () => {
    const { board } = openBoard();
    expect(board.hud().lines).toEqual(['Lv 1', 'XP 0 / 200', 'Coins 0']);
    board.ingest({
      type: 'snapshot',
      character: { id: 'fig-self', place: 'town', gender: 'woman', level: 6, xp: 40, coins: 3, hp: 140, maxHp: 140 },
      snapshot: { players: [], monsters: [], coins: [], pickups: [] },
    });
    expect(board.hud().lines).toEqual(['Lv 6', 'XP 40', 'Coins 3']);
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

  it('floats +N in gold for the local coin only, above its last spot, for one second', () => {
    const { board } = openBoard();
    const skeletonCoins = onionMonsterRows.find((row) => row.id === 'skeleton')!.coins;
    const bearCoins = onionMonsterRows.find((row) => row.id === 'bear')!.coins;
    const players = [fig({ id: 'fig-self', x: 400, y: 400, place: 'green' })];
    const mine = { id: 'coin-mine', ownerId: 'fig-self', x: 420, y: 380, value: skeletonCoins };
    const theirs = { id: 'coin-theirs', ownerId: 'fig-other', x: 420, y: 380, value: bearCoins };
    const snap = (coins: typeof mine[], hits: unknown[] = []) => ({
      type: 'snapshot',
      character: { id: 'fig-self', place: 'green', gender: 'woman', hp: 70, maxHp: 70 },
      snapshot: { players, monsters: [], coins, pickups: [], hits },
    });
    board.ingest(snap([mine, theirs]));
    const before = Date.now();
    expect(board.damageNumbers(before)).toEqual([]);

    // The other fig's coin leaves. Nothing floats for this client.
    board.ingest(snap([mine]));
    expect(board.damageNumbers(Date.now())).toEqual([]);

    const hit = { id: 'hit-coin', targetKind: 'monster', targetId: 'wolf-1', amount: 4, x: mine.x, y: mine.y };
    board.ingest(snap([], [hit]));
    const now = Date.now();
    const floated = board.damageNumbers(now);
    const melon = floated.find((row) => row.id === 'melon:coin-mine');
    const wound = floated.find((row) => row.id === 'hit-coin');
    expect(melon).toMatchObject({ amount: skeletonCoins, color: '#e0b15a', text: `+${skeletonCoins}` });
    expect(floated.filter((row) => row.text.startsWith('+'))).toEqual([melon]);
    expect(wound?.color).toBe('#ffffff');
    expect(wound?.text).toBe('4');
    expect(melon!.x).toBe(wound!.x);
    const risen = board.damageNumbers(now + 500);
    const melonRisen = risen.find((row) => row.id === 'melon:coin-mine')!;
    expect(melonRisen.y).toBeLessThan(melon!.y);
    expect(melonRisen.x).toBe(melon!.x);
    expect(board.damageNumbers(now + 1000).some((row) => row.id === 'melon:coin-mine')).toBe(false);
  });

  it('floats +N in gold when a walk-on pickup removes the owner coin', () => {
    const { board } = openBoard();
    const wolfCoins = onionMonsterRows.find((row) => row.id === 'wolf')!.coins;
    const players = [fig({ id: 'fig-self', x: 400, y: 400, place: 'green' })];
    const mine = { id: 'coin-walk', ownerId: 'fig-self', x: 410, y: 400, value: wolfCoins };
    const snap = (coins: typeof mine[]) => ({
      type: 'snapshot',
      character: { id: 'fig-self', place: 'green', gender: 'woman', hp: 70, maxHp: 70, coins: 0 },
      snapshot: { players, monsters: [], coins, pickups: [] },
    });
    board.ingest(snap([mine]));
    const before = Date.now();
    expect(board.damageNumbers(before)).toEqual([]);
    board.ingest(snap([]));
    const floated = board.damageNumbers(Date.now());
    expect(floated).toEqual([
      expect.objectContaining({ id: 'melon:coin-walk', amount: wolfCoins, color: '#e0b15a', text: `+${wolfCoins}` }),
    ]);
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
    expect(mangoOf(lemon, 0)).toEqual({ type: 'attack', monsterId: 'beet-wolf', once: true, walk: true });

    board.click({ x: 242, y: 566, button: 0 });
    expect(lemon.sent).toHaveLength(2);
    expect(mangoOf(lemon, 1)).toEqual({ type: 'fountain', x: 242, y: 566 });

    board.click({ x: 150, y: 480, button: 0 });
    expect(lemon.sent).toHaveLength(2);
    expect(board.smithOpen).toBe(true);

    board.chooseQuince('shortSword');
    expect(lemon.sent).toHaveLength(3);
    expect(mangoOf(lemon, 2)).toEqual({ type: 'buy', item: 'shortSword' });
    expect(board.smithOpen).toBe(true);

    board.click({ x: 700, y: 500, button: 2 });
    // The right click only opens the duel menu; choosing Duel sends the request.
    expect(lemon.sent).toHaveLength(3);
    board.requestDuel('fig-other');
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

    const melon = beetSpriteRect(900, 360, 'wolf');
    const headY = 360 - melon.pictureHeight + 1;
    expect(360 - headY).toBeGreaterThan(scaleFor('wolf') / 2);
    board.click({ x: 900, y: headY, button: 0 });
    expect(mangoOf(lemon, 7)).toEqual({ type: 'attack', monsterId: 'beet-wolf', once: true, walk: true });
    board.click({ x: 900, y: melon.y - 1, button: 0 });
    expect(mangoOf(lemon, 8)).toEqual({ type: 'move', x: 900, y: melon.y - 1 });
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
    const coinValue = onionMonsterRows.find((row) => row.id === 'skeleton')!.coins;
    const coin: CoinSnapshot = { id: 'seed-1', ownerId: owner.id, x: 140, y: 80, value: coinValue };
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
    expect(COIN_DRAW_PX).toBe(24);
    expect(ground.width).toBe(24);
    expect(ground.height).toBe(24);
    expect(board.draw().filter((still) => still.role === 'coin')).toHaveLength(1);

    // The dig row is gone, so the pet stands on the owner again, even after the owner walks off.
    const away = fig({ id: 'fig-self', x: 20, y: 200, moving: true });
    feed(board, { players: [away], monsters: [], coins: [], pickups: [] });
    const home = role(board.draw(), 'pet', 'pet:fig-self');
    expect(home.still).toBe('walk');
    expect(home.src).toBe('/avatars/axolotl/walk.png');
    expect(home.x).toBe(away.x);
    expect(home.y).toBe(away.y);

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
    for (const id of ['wolf', 'bear', 'skeleton'] as const) {
      const still = role(moving, 'monster', id);
      const box = beetSpriteRect(still.x, still.y, still.kind, still.src);
      expect(still.width).toBe(box.pictureWidth);
      expect(still.height).toBe(box.pictureHeight);
      expect(still.y - still.height).toBe(box.y + BEET_PAD_PX);
    }

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

describe('blacksmith shop and inventory', () => {
  it('shows the three-dot bubble in town only; Bag stays everywhere', () => {
    const { board } = openBoard();
    const send = (place: string) =>
      board.ingest({
        type: 'snapshot',
        character: { id: 'fig-self', place, gender: 'woman' },
        snapshot: { players: [fig({ id: 'fig-self', x: 300, y: 450, place })], monsters: [], coins: [], pickups: [] },
      });
    send('town');
    expect(board.controls().map((row) => row.id)).toEqual(['bubble', 'menu', 'bag']);
    send('green');
    expect(board.controls().map((row) => row.id)).toEqual(['menu', 'bag']);
  });

  it('opens the six-item shop from the thought bubble and the inventory from Bag', () => {
    const { board } = openBoard();
    const players = [fig({ id: 'fig-self', x: 300, y: 450, place: 'town' })];
    const snap = (character: Record<string, unknown>) => ({
      type: 'snapshot',
      character: { id: 'fig-self', place: 'town', gender: 'woman', ...character },
      snapshot: { players, monsters: [], coins: [], pickups: [] },
    });
    board.ingest(
      snap({
        level: 2,
        xp: 4,
        hp: 54,
        maxHp: 92,
        coins: 2400,
        sword: 'shortSword',
        armor: 'leather',
      }),
    );

    const smith = role(board.draw(), 'blacksmith');
    expect(smith.src).toBe('/avatars/blacksmith/stand.png');
    expect(smith.height).toBe(scaleFor('player'));
    const bubble = board.controls().find((row) => row.id === 'bubble');
    const bag = board.controls().find((row) => row.id === 'bag');
    expect(bubble?.text).toBe('...');
    expect(bag?.text).toBe('Bag');
    expect(bag?.label).toBe('Bag');
    expect(LIME_BUBBLE_W).toBe(64);
    expect(LIME_BUBBLE_H).toBe(36);
    expect(bubble!.width).toBe(LIME_BUBBLE_W);
    expect(bubble!.height).toBe(LIME_BUBBLE_H);
    expect(bubble!.font).toBe(LIME_BUBBLE_FONT);
    expect(bubble!.width).toBeLessThan(220);
    expect(bubble!.height).toBeLessThan(64 * 0.7);
    const view = board.camera();
    const feet = mapToCanvas(view, SMITH_X, SMITH_Y);
    const headTop = feet.y - scaleFor('blacksmith') * view.scale;
    expect(bubble!.y + bubble!.height).toBeLessThanOrEqual(headTop);
    expect(bubble!.x).toBeGreaterThanOrEqual(0);
    expect(bubble!.y).toBeGreaterThanOrEqual(0);
    expect(bubble!.x + bubble!.width).toBeLessThanOrEqual(1280);
    expect(bubble!.y + bubble!.height).toBeLessThanOrEqual(720);

    expect(board.pressScreen(bubble!.x + 4, bubble!.y + 4)).toBe(true);
    expect(board.smithOpen).toBe(true);
    const shop = board.shop();
    expect(shop?.coins).toBe(2400);
    expect(shop?.rows).toHaveLength(6);
    expect(shop?.rows.filter((row) => row.canBuy).map((row) => row.id)).toEqual([
      'shortSword',
      'longSword',
      'leather',
      'chain',
    ]);
    expect(shop?.rows.filter((row) => !row.canBuy).map((row) => row.id)).toEqual(['greatSword', 'plate']);

    board.ingest(
      snap({
        level: 2,
        xp: 4,
        hp: 54,
        maxHp: 92,
        coins: 14,
        sword: 'shortSword',
        armor: 'leather',
      }),
    );
    expect(board.pressScreen(bag!.x + 4, bag!.y + 4)).toBe(true);
    expect(board.bagOpen).toBe(true);
    expect(board.smithOpen).toBe(false);
    expect(board.inventory()).toEqual({
      coins: 14,
      expiry: '',
      expiryTip: '',
      sword: 'Short sword',
      armor: 'Leather',
      swordBonus: '+2 strike',
      armorBonus: '+12 max HP',
      level: 2,
      health: '54 / 92',
      strike: 7,
      experience: '4 / 400',
      tiles: [],
      portrait: '/avatars/warrior-f/stand.png',
    });

    board.ingest(snap({ level: 1, xp: 0, hp: 70, maxHp: 70, coins: 0, sword: null, armor: null }));
    expect(board.inventory()).toEqual({
      expiry: '',
      expiryTip: '',
      coins: 0,
      sword: 'Nothing worn',
      armor: 'Nothing worn',
      swordBonus: '',
      armorBonus: '',
      level: 1,
      health: '70 / 70',
      strike: 4,
      experience: '0 / 200',
      tiles: [],
      portrait: '/avatars/warrior-f/stand.png',
    });

    expect(board.pressScreen(bag!.x + 4, bag!.y + 4)).toBe(true);
    expect(board.bagOpen).toBe(false);
    expect(board.inventory()).toBeNull();

    expect(board.pressScreen(bubble!.x + 4, bubble!.y + 4)).toBe(true);
    expect(board.smithOpen).toBe(true);
    board.closePanels();
    expect(board.smithOpen).toBe(false);
    expect(board.bagOpen).toBe(false);
    expect(board.shop()).toBeNull();
  });

  it('lists weapons then armor with buy, need, and owned', () => {
    const sheet = shopSheet(2400, ['shortSword', 'leather']);
    expect(sheet.coins).toBe(2400);
    expect(sheet.rows.map((row) => row.id)).toEqual(mangoGearRows.map((row) => row.id));
    expect(sheet.rows.map((row) => row.group)).toEqual([
      'Weapons',
      'Weapons',
      'Weapons',
      'Armor',
      'Armor',
      'Armor',
    ]);
    expect(sheet.rows.map((row) => row.state)).toEqual(['owned', 'buy', 'need', 'owned', 'buy', 'need']);
    expect(sheet.rows.map((row) => row.effect)).toEqual([
      'Strike +2',
      'Strike +4',
      'Strike +7',
      'Max HP +12',
      'Max HP +24',
      'Max HP +40',
    ]);
    expect(sheet.rows.map((row) => row.price)).toEqual(mangoGearRows.map((row) => row.price));
    expect(sheet.rows.every((row) => row.canBuy === (row.state === 'buy'))).toBe(true);
    expect(sheet.rows.every((row) => row.owned === (row.state === 'owned'))).toBe(true);
    expect(shopSheet(0).rows.every((row) => row.state === 'need')).toBe(true);
    expect(shopSheet(4000).rows.every((row) => row.state === 'buy')).toBe(true);
  });
});

describe('bag tiles, drag, and the centered sheet', () => {
  const worn = { sword: 'shortSword' as string | null, armor: 'leather' as string | null };
  const facts = {
    coins: 14,
    sword: 'shortSword' as string | null,
    armor: 'leather' as string | null,
    level: 2,
    hp: 54,
    maxHp: 92,
    xp: 4,
    place: 'town' as const,
    items: ['shortSword', 'longSword', 'leather'],
    gender: 'woman' as const,
  };

  it('lists each owned quince with its name and bonus', () => {
    expect(bagTiles(facts.items, facts.sword, facts.armor)).toEqual([
      { id: 'shortSword', name: 'Short sword', bonus: '+2 strike', label: 'Short sword +2 strike', worn: true, slot: 'sword' },
      { id: 'longSword', name: 'Long sword', bonus: '+4 strike', label: 'Long sword +4 strike', worn: false, slot: 'sword' },
      { id: 'leather', name: 'Leather', bonus: '+12 max HP', label: 'Leather +12 max HP', worn: true, slot: 'armor' },
    ]);
    expect(figStandSrc('man')).toBe('/avatars/warrior-m/stand.png');
    expect(figStandSrc(undefined)).toBe('/avatars/warrior-f/stand.png');
  });

  it('equips a matching drop, ignores the wrong slot, and unequips a drag back to the row', () => {
    const longSword = { from: 'tile' as const, itemId: 'longSword', slot: 'sword' as const };
    const leather = { from: 'tile' as const, itemId: 'leather', slot: 'armor' as const };
    expect(oliveDrop(longSword, { kind: 'slot', slot: 'sword' }, worn)).toEqual({ type: 'equip', itemId: 'longSword' });
    expect(oliveDrop(leather, { kind: 'slot', slot: 'sword' }, worn)).toBeNull();
    expect(oliveDrop(longSword, { kind: 'row' }, worn)).toBeNull();
    expect(oliveDrop({ from: 'tile', itemId: 'shortSword', slot: 'sword' }, { kind: 'slot', slot: 'sword' }, worn)).toBeNull();
    expect(oliveDrop({ from: 'slot', itemId: 'shortSword', slot: 'sword' }, { kind: 'row' }, worn)).toEqual({
      type: 'unequip',
      slot: 'sword',
    });
    expect(oliveDrop({ from: 'slot', itemId: 'leather', slot: 'armor' }, { kind: 'slot', slot: 'armor' }, worn)).toBeNull();
    expect(oliveDrop({ from: 'slot', itemId: 'shortSword', slot: 'sword' }, { kind: 'row' }, { sword: null, armor: 'leather' })).toBeNull();
  });

  it('highlights the matching slot and previews the next Strike or Health', () => {
    expect(oliveDragFace(facts, { from: 'tile', itemId: 'longSword', slot: 'sword' })).toEqual({
      sword: 'lime',
      armor: 'peach',
      row: 'rest',
      hint: 'Strike 7 becomes 9',
    });
    expect(oliveDragFace(facts, { from: 'tile', itemId: 'leather', slot: 'armor' })).toEqual({
      sword: 'rest',
      armor: 'rest',
      row: 'rest',
      hint: '',
    });
    expect(oliveHint(facts, null, 'leather')).toBe('Strike 7 becomes 5');
    expect(oliveDragFace(facts, { from: 'slot', itemId: 'shortSword', slot: 'sword' }).row).toBe('lime');
    const bare = { ...facts, sword: null, armor: null, level: 1, hp: 40, maxHp: 70, items: ['leather'] };
    expect(oliveDragFace(bare, { from: 'tile', itemId: 'leather', slot: 'armor' }).hint).toBe(
      'Health 40 / 70 becomes 40 / 82',
    );
    const full = { ...facts, level: 1, hp: 80, maxHp: 82, sword: null, armor: 'leather' };
    expect(oliveHint(full, null, null)).toBe('Health 80 / 82 becomes 70 / 70');
  });

  it('keeps the centered bag off the zoom slider at 1280x800 and 1280x720', () => {
    for (const viewport of [
      { width: 1280, height: 800 },
      { width: 1280, height: 720 },
    ]) {
      const stage = Math.min(viewport.height, (viewport.width * 9) / 16);
      const panel = olivePanelBox(viewport.width, viewport.height, viewport.height);
      const slider = kiwiSliderBox(viewport.width, stage);
      expect(panel.right - panel.left).toBe(860);
      expect(panel.left).toBeCloseTo((viewport.width - 860) / 2, 5);
      expect(papayaRectsOverlap(panel, slider)).toBe(false);
      expect(panel.right).toBeLessThan(slider.left);
    }
  });
});

describe('shared account bag tiles', () => {
  it('lists copies another avatar wears as greyed tiles with that avatar name, and keeps your own first', () => {
    const tiles = bagTiles(['leather', 'shortSword'], 'shortSword', null, [{ itemId: 'longSword', by: 'Ayla' }]);
    expect(tiles.map((tile) => tile.id)).toEqual(['leather', 'shortSword', 'longSword']);
    expect(tiles[1]!.worn).toBe(true);
    expect(tiles[2]!.by).toBe('Ayla');
    expect(tiles[2]!.worn).toBe(false);
    expect(tiles[0]!.by).toBeUndefined();
  });

  it('inventorySheet carries the elsewhere tiles, and the shop marks them Owned', () => {
    const sheet = inventorySheet({
      coins: 10, sword: null, armor: null, level: 1, hp: 70, maxHp: 70, xp: 0, place: 'town', items: [],
      elsewhere: [{ itemId: 'shortSword', by: 'Ayla' }], gender: 'woman',
    });
    expect(sheet.tiles).toHaveLength(1);
    expect(sheet.tiles[0]!.by).toBe('Ayla');
    const shop = shopSheet(100, ['shortSword']);
    expect(shop.rows.find((row) => row.id === 'shortSword')!.state).toBe('owned');
  });
});

describe('coin expiry text', () => {
  const now = 1_000_000_000_000;
  it('words the time left in days, hours or minutes, and is empty with no coins', () => {
    expect(coinExpiryText(null, now)).toBe('');
    expect(coinExpiryText({ amount: 0, atMs: now + 1000 }, now)).toBe('');
    expect(coinExpiryText({ amount: 12, atMs: now + 1.5 * 86_400_000 }, now)).toBe('12 coins expire within 2 days.');
    expect(coinExpiryText({ amount: 1, atMs: now + 5 * 3_600_000 }, now)).toBe('1 coin expires today.');
    expect(coinExpiryText({ amount: 4, atMs: now + 90_000 }, now)).toBe('4 coins expire today.');
    expect(coinExpiryText({ amount: 9, atMs: now + 3_600_000, lastAtMs: now + 1.2 * 86_400_000 }, now)).toBe('9 coins expire within 2 days.');
    expect(coinExpiryTip({ amount: 12, atMs: now + 86_400_000, groups: [{ amount: 5, atMs: now + 20 * 3_600_000 }, { amount: 7, atMs: now + 1.5 * 86_400_000 }] }, now)).toBe('5 in 20 hours, 7 in 2 days');
    expect(coinExpiryTip(null, now)).toBe('');
    expect(coinExpiryTip({ amount: 1, atMs: now + 3_600_000 }, now)).toBe('1 in 1 hour');
    expect(coinExpiryTip({ amount: 1, atMs: now - 1 }, now)).toBe('1 in under a minute');
    expect(coinExpiryText({ amount: 10, atMs: now - 5 }, now)).toBe('');
  });
});
