// Death: a cross where the avatar was killed, the camera held there while the death panel is open, clicks ignored, and
// the coin sound / respawn delay constants. The server marks the killing hit with `fatal`.
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { CANVAS_HEIGHT, CANVAS_WIDTH, viewBox } from '../../src/client/camera';
import { peelClick } from '../../src/client/input';
import { plantFigBoard } from '../../src/client/main';
import { GRAVE_LIFETIME_MS, RESPAWN_GLOW_MS, paintGraves, paintRespawnGlow } from '../../src/client/view';
import { ZOOM_CLOSE } from '../../src/rules/tables';
import { stepAggro } from '../../src/world/combat';
import { plantCabbage } from '../../src/world/monsters';
import { sproutFig } from '../../src/world/core';

const pageHtml = readFileSync(new URL('../../src/client/index.html', import.meta.url), 'utf8');

function quietLemon(sent: string[] = []) {
  return {
    send(data: string) {
      sent.push(data);
    },
    close() {},
    addEventListener() {},
  };
}

function fig(id: string, place: 'town' | 'green', x: number, y: number) {
  return { id, name: id, x, y, facing: 'right' as const, moving: false, place, duelPartnerId: null, gender: 'woman' as const, attacking: false };
}

function killedSnapshot(hitExtra: Record<string, unknown>) {
  return {
    type: 'snapshot' as const,
    character: { id: 'fig-self', place: 'town' as const, gender: 'woman' as const },
    // The server already moved the avatar to town.
    snapshot: {
      players: [fig('fig-self', 'town', 300, 440)],
      monsters: [],
      coins: [],
      pickups: [],
      hits: [{ id: 'hit-1', targetKind: 'player', targetId: 'fig-self', amount: 9, x: 900, y: 400, ...hitExtra }],
    },
  };
}

describe('death panel and cross', () => {
  it('the server marks a killing bite as fatal and an ordinary bite as not', () => {
    const bed = plantCabbage();
    const wolf = bed.beets.find((b) => b.kind === 'wolf')!;
    const victim = (hp: number) =>
      sproutFig({ id: 'p', name: 'p', nameKey: 'p', gender: 'woman', level: 1, xp: 0, hp, maxHp: 70, coins: 0, sword: null, armor: null, items: [], place: 'green', x: wolf.x + 20, y: wolf.y });
    const chasing = { ...bed, beets: bed.beets.map((b) => (b.id === wolf.id ? { ...b, targetId: 'p' } : b)) };
    const hurt = stepAggro(chasing, new Map([['p', victim(70)]]), 100, 100);
    expect(hurt.bites).toHaveLength(1);
    expect(hurt.bites[0]!.fatal).toBeUndefined();
    const killed = stepAggro(chasing, new Map([['p', victim(3)]]), 100, 100);
    expect(killed.bites[0]!.fatal).toBe(true);
    // The mark carries the spot where the avatar stood, before it was moved to town.
    expect(killed.bites[0]!.x).toBeCloseTo(wolf.x + 20, 5);
  });

  const deadSnapshot = (deadIds: string[], hitExtra: Record<string, unknown> = { fatal: true }) => ({
    type: 'snapshot' as const,
    character: { id: 'fig-self', place: 'town' as const, gender: 'woman' as const },
    snapshot: {
      players: [
        { ...fig('fig-self', 'green', 900, 400), ...(deadIds.includes('fig-self') ? { dead: true } : {}) },
        { ...fig('fig-other', 'green', 700, 380), ...(deadIds.includes('fig-other') ? { dead: true } : {}) },
      ],
      monsters: [],
      coins: [],
      pickups: [],
      hits: [{ id: `hit-${deadIds.join('-')}`, targetKind: 'player', targetId: deadIds[0] ?? 'fig-self', amount: 9, x: 900, y: 400, ...hitExtra }],
    },
  });

  it('a fatal hit on this player shows the panel, holds the camera on the spot and ignores clicks until the server says alive', () => {
    const sent: string[] = [];
    const onDeath = vi.fn();
    const onRespawned = vi.fn();
    const board = plantFigBoard({ selfId: 'fig-self', selfPlace: 'green', createSocket: () => quietLemon(sent), hooks: { onDeath, onRespawned } });
    board.ingest(deadSnapshot(['fig-self']));
    expect(onDeath).toHaveBeenCalledTimes(1);
    expect(board.camera()).toEqual(viewBox('green', 900, 400, ZOOM_CLOSE));
    const before = sent.length;
    board.click({ x: 500, y: 500, button: 0 });
    expect(board.pressScreen(1200, 40)).toBe(true);
    expect(sent.length).toBe(before);
    // Respawn asks the server; the page stays held until a snapshot shows the avatar alive again.
    board.respawn();
    expect(JSON.parse(sent[sent.length - 1]!)).toEqual({ type: 'respawn' });
    expect(onRespawned).not.toHaveBeenCalled();
    board.ingest({ ...killedSnapshot({ id: 'none' }), snapshot: { players: [fig('fig-self', 'town', 300, 440)], monsters: [], coins: [], pickups: [], hits: [] } });
    expect(onRespawned).toHaveBeenCalledTimes(1);
    expect(board.camera()).toEqual(viewBox('town', 300, 440, ZOOM_CLOSE));
    const after = sent.length;
    board.click({ x: 500, y: 500, button: 0 });
    expect(sent.length).toBe(after + 1);
  });

  it('a dead avatar is a cross for everyone until it respawns, and is not drawn as a character', () => {
    const onDeath = vi.fn();
    const board = plantFigBoard({ selfId: 'fig-self', selfPlace: 'green', createSocket: () => quietLemon(), hooks: { onDeath } });
    const view = viewBox('green', 900, 400, ZOOM_CLOSE);
    const rects: number[] = [];
    const ctx = { fillStyle: '', fillRect: () => void rects.push(1) };
    // Someone else is killed: no panel for this player, a cross on their spot, and no still for them.
    board.ingest(deadSnapshot(['fig-other'], { id: 'k1', targetId: 'fig-other', fatal: true, x: 700, y: 380 }));
    expect(onDeath).not.toHaveBeenCalled();
    expect(board.pose().some((still) => still.id === 'fig-other')).toBe(false);
    board.paintGraves(ctx, viewBox('green', 700, 380, ZOOM_CLOSE), 5_000_000);
    expect(rects).toHaveLength(4);
    // They respawn (the snapshot has no dead flag any more): the cross goes away at once.
    rects.length = 0;
    board.ingest(deadSnapshot([], { id: 'k2' }));
    board.paintGraves(ctx, view, 5_000_000);
    expect(rects).toHaveLength(0);
    expect(board.pose().some((still) => still.id === 'fig-other')).toBe(true);
  });

  it('the health bar shows the duel health, labelled, while the player is in a duel', () => {
    const board = plantFigBoard({ selfId: 'fig-self', selfPlace: 'green', createSocket: () => quietLemon() });
    board.ingest({
      type: 'snapshot' as const,
      character: { id: 'fig-self', place: 'green' as const, gender: 'woman' as const },
      snapshot: {
        players: [{ ...fig('fig-self', 'green', 900, 400), duelPartnerId: 'fig-other', duelHp: 70, duelMaxHp: 104 }, fig('fig-other', 'green', 940, 400)],
        monsters: [], coins: [], pickups: [],
      },
    });
    expect(board.health().text).toBe('Duel 70 / 104');
  });

  it('paints a cross inside the view, nothing outside it, and nothing after the cross has run out', () => {
    const view = viewBox('green', 900, 400, ZOOM_CLOSE);
    const rects: string[] = [];
    const ctx = { fillStyle: '', fillRect: (x: number, y: number, w: number, h: number) => void rects.push(`${x},${y},${w},${h}`) };
    expect(paintGraves(ctx, [{ x: 900, y: 400, at: 1000 }], view, 1000)).toBe(1);
    expect(rects).toHaveLength(4);
    rects.length = 0;
    expect(paintGraves(ctx, [{ x: 10, y: 10, at: 1000 }], view, 1000)).toBe(0);
    expect(paintGraves(ctx, [{ x: 900, y: 400, at: 1000 }], view, 1000 + GRAVE_LIFETIME_MS)).toBe(0);
    expect(rects).toHaveLength(0);
    expect(CANVAS_WIDTH).toBeGreaterThan(0);
    expect(CANVAS_HEIGHT).toBeGreaterThan(0);
  });

  it('the page has the panel with Respawn in town and Exit game, and the coin sound exists', () => {
    expect(pageHtml).toContain('id="death-panel"');
    expect(pageHtml).toContain('Respawn in town');
    expect(pageHtml).toContain('id="death-exit"');
    expect(pageHtml).toContain('Exit game');
    expect(readFileSync(new URL('../../assets/sounds/sfx/coin.mp3', import.meta.url)).length).toBeGreaterThan(10_000);
  });

  it('after respawn a pulsing light marks the avatar in town for a few seconds, then goes away', () => {
    const view = viewBox('town', 300, 440, ZOOM_CLOSE);
    const draws: string[] = [];
    const gradient = { addColorStop() {} } as unknown as CanvasGradient;
    const ctx = {
      globalAlpha: 1,
      fillStyle: '' as string | CanvasGradient,
      fillRect: (x: number, y: number, w: number, h: number) => void draws.push(`${Math.round(x)},${Math.round(y)},${Math.round(w)},${Math.round(h)}`),
      createRadialGradient: () => gradient,
    };
    const glow = { x: 300, y: 440, at: 1000 };
    expect(paintRespawnGlow(ctx, null, view, 1000)).toBe(false);
    expect(paintRespawnGlow(ctx, glow, view, 1500)).toBe(true);
    expect(draws).toHaveLength(1);
    expect(ctx.globalAlpha).toBe(1);
    expect(paintRespawnGlow(ctx, glow, view, 1000 + RESPAWN_GLOW_MS)).toBe(false);
    // Without gradients on the canvas it still marks the spot.
    const plain = { fillStyle: '' as string | CanvasGradient, fillRect: (x: number, y: number, w: number, h: number) => void draws.push(`${x},${y},${w},${h}`) };
    expect(paintRespawnGlow(plain, glow, view, 1500)).toBe(true);
  });

  it('ending the death sets the light on the avatar, which paints and then expires on the board', () => {
    const board = plantFigBoard({ selfId: 'fig-self', selfPlace: 'town', createSocket: () => quietLemon() });
    board.ingest(killedSnapshot({ fatal: true }));
    board.endDeath();
    const draws: number[] = [];
    const ctx = { globalAlpha: 1, fillStyle: '' as string | CanvasGradient, fillRect: () => void draws.push(1) };
    board.paintRespawnGlow(ctx, viewBox('town', 300, 440, ZOOM_CLOSE), Date.now() + 200);
    expect(draws).toHaveLength(1);
    board.paintRespawnGlow(ctx, viewBox('town', 300, 440, ZOOM_CLOSE), Date.now() + RESPAWN_GLOW_MS + 500);
    expect(draws).toHaveLength(1);
  });

  it('in a duel a right click on the partner walks over and swings until one falls; a left click swings once', () => {
    const orchard = {
      selfId: 'me',
      selfPlace: 'green' as const,
      duelPartnerId: 'foe',
      players: [
        { id: 'me', x: 100, y: 100 },
        { id: 'foe', x: 300, y: 300 },
        { id: 'other', x: 500, y: 300 },
      ],
      monsters: [],
    };
    expect(peelClick({ x: 300, y: 270, button: 2 }, orchard).message).toEqual({ type: 'attack', playerId: 'foe', walk: true });
    expect(peelClick({ x: 300, y: 270, button: 0 }, orchard).message).toEqual({ type: 'attack', playerId: 'foe', once: true, walk: true });
    // A left click on someone who is not the partner only walks.
    expect(peelClick({ x: 500, y: 270, button: 0 }, orchard).message).toEqual({ type: 'move', x: 500, y: 270 });
    // Someone who is not the partner gets the duel menu, even in the middle of a duel.
    expect(peelClick({ x: 500, y: 270, button: 2 }, orchard)).toEqual({ message: null, smithOpen: false, duelMenu: { playerId: 'other' } });
    // Without a duel the partner's spot is just another player.
    expect(peelClick({ x: 300, y: 270, button: 2 }, { ...orchard, duelPartnerId: null })).toEqual({ message: null, smithOpen: false, duelMenu: { playerId: 'foe' } });
  });

});
