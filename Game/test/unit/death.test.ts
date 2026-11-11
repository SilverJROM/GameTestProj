// Death: a cross where the avatar was killed, the camera held there while the death panel is open, clicks ignored, and
// the coin sound / respawn delay constants. The server marks the killing hit with `fatal`.
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { CANVAS_HEIGHT, CANVAS_WIDTH, viewBox } from '../../src/client/camera';
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

  it('a fatal hit on this player shows the panel, holds the camera on the spot and ignores clicks until it ends', () => {
    const sent: string[] = [];
    const onDeath = vi.fn();
    const board = plantFigBoard({ selfId: 'fig-self', selfPlace: 'town', createSocket: () => quietLemon(sent), hooks: { onDeath } });
    board.ingest(killedSnapshot({ fatal: true }));
    expect(onDeath).toHaveBeenCalledTimes(1);
    expect(board.camera()).toEqual(viewBox('green', 900, 400, ZOOM_CLOSE));
    const before = sent.length;
    board.click({ x: 500, y: 500, button: 0 });
    expect(board.pressScreen(1200, 40)).toBe(true);
    expect(sent.length).toBe(before);
    board.endDeath();
    expect(board.camera()).toEqual(viewBox('town', 300, 440, ZOOM_CLOSE));
    board.click({ x: 500, y: 500, button: 0 });
    expect(sent.length).toBe(before + 1);
  });

  it('an ordinary hit, or someone else being killed, does not open the panel but still leaves a cross for the other kill', () => {
    const onDeath = vi.fn();
    const board = plantFigBoard({ selfId: 'fig-self', selfPlace: 'town', createSocket: () => quietLemon(), hooks: { onDeath } });
    board.ingest(killedSnapshot({}));
    expect(onDeath).not.toHaveBeenCalled();
    board.ingest(killedSnapshot({ id: 'hit-2', targetId: 'fig-other', fatal: true }));
    expect(onDeath).not.toHaveBeenCalled();
    const rects: string[] = [];
    const ctx = { fillStyle: '', fillRect: (x: number, y: number, w: number, h: number) => void rects.push(`${x},${y},${w},${h}`) };
    board.paintGraves(ctx, viewBox('green', 900, 400, ZOOM_CLOSE), Date.now());
    expect(rects.length).toBe(4);
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
});
