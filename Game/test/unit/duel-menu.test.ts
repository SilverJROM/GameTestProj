// The duel menu, the waiting dots, and the click boxes of other players.
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { viewBox } from '../../src/client/camera';
import { figSpriteHolds, frontFig, peelClick } from '../../src/client/input';
import { plantFigBoard } from '../../src/client/main';
import { paintDuelDots, paintFigRim } from '../../src/client/view';
import { ZOOM_CLOSE } from '../../src/rules/tables';

const pageHtml = readFileSync(new URL('../../src/client/index.html', import.meta.url), 'utf8');

function lemon(sent: string[]) {
  return { send: (d: string) => void sent.push(d), close() {}, addEventListener() {} };
}

const fig = (id: string, x: number, y: number, partner: string | null = null) => ({
  id,
  name: id,
  x,
  y,
  facing: 'right' as const,
  moving: false,
  place: 'green' as const,
  duelPartnerId: partner,
  gender: 'woman' as const,
  attacking: false,
});

const snap = (players: ReturnType<typeof fig>[]) => ({
  type: 'snapshot' as const,
  character: { id: 'me', place: 'green' as const, gender: 'woman' as const },
  snapshot: { players, monsters: [], coins: [], pickups: [] },
});

describe('the other player has a real click box', () => {
  it('covers the whole drawn body: feet, chest, head, and a little padding; not the ground far to the side', () => {
    const f = { x: 400, y: 400 };
    for (const [x, y] of [[400, 400], [400, 370], [400, 345], [410, 380], [390, 380]]) expect(figSpriteHolds(f, x, y), `${x},${y}`).toBe(true);
    for (const [x, y] of [[440, 380], [400, 320], [400, 430]]) expect(figSpriteHolds(f, x, y), `${x},${y}`).toBe(false);
  });
  it('the player in front (lowest feet) wins when two overlap', () => {
    const rows = [{ id: 'back', x: 400, y: 380 }, { id: 'front', x: 404, y: 400 }];
    expect(frontFig(400, 380, rows)?.id).toBe('front');
  });
});

describe('the duel menu and the waiting dots', () => {
  it('right click on a player opens the menu through the hook and sends nothing', () => {
    const sent: string[] = [];
    const onDuelMenu = vi.fn();
    const board = plantFigBoard({ selfId: 'me', selfPlace: 'green', createSocket: () => lemon(sent), hooks: { onDuelMenu } });
    board.ingest(snap([fig('me', 300, 300), fig('foe', 380, 300)]));
    board.click({ x: 380, y: 270, button: 2 });
    expect(onDuelMenu).toHaveBeenCalledWith('foe', 'foe');
    expect(sent).toHaveLength(0);
    // Without a duel a left click walks: it never opens the menu or attacks.
    board.click({ x: 380, y: 270, button: 0 });
    expect(JSON.parse(sent[0]!).type).toBe('move');
    expect(onDuelMenu).toHaveBeenCalledTimes(1);
  });

  it('Duel sends the request and shows the waiting dots until the target accepts (a partner appears)', () => {
    const sent: string[] = [];
    const board = plantFigBoard({ selfId: 'me', selfPlace: 'green', createSocket: () => lemon(sent) });
    board.ingest(snap([fig('me', 300, 300), fig('foe', 380, 300)]));
    board.requestDuel('foe');
    expect(JSON.parse(sent[0]!)).toEqual({ type: 'duel_request', playerId: 'foe' });
    expect(board.duelPending()).toBe('foe');
    const draws: number[] = [];
    const ctx = { fillStyle: '', font: '', fillRect: () => void draws.push(1) };
    board.paintDuelWaiting(ctx, viewBox('green', 300, 300, ZOOM_CLOSE), Date.now());
    expect(draws.length).toBeGreaterThanOrEqual(6);
    // The target accepts: both are paired, the dots are removed.
    board.ingest(snap([fig('me', 300, 300, 'foe'), fig('foe', 380, 300, 'me')]));
    expect(board.duelPending()).toBeNull();
    draws.length = 0;
    board.paintDuelWaiting(ctx, viewBox('green', 300, 300, ZOOM_CLOSE), Date.now());
    expect(draws).toHaveLength(0);
  });

  it('the dots go away when the target declines, when the asker cancels, and (for the target) the offer panel closes on a cancel', () => {
    const sent: string[] = [];
    const onOffer = vi.fn();
    const board = plantFigBoard({ selfId: 'me', selfPlace: 'green', createSocket: () => lemon(sent), hooks: { onOffer } });
    board.ingest(snap([fig('me', 300, 300), fig('foe', 380, 300)]));
    board.requestDuel('foe');
    board.ingest({ type: 'duel_declined', otherId: 'foe' } as never);
    expect(board.duelPending()).toBeNull();
    board.requestDuel('foe');
    board.cancelDuelRequest();
    expect(JSON.parse(sent[sent.length - 1]!)).toEqual({ type: 'duel_cancel', playerId: 'foe' });
    expect(board.duelPending()).toBeNull();
    // The other side: an offer arrives, then the asker withdraws.
    board.ingest({ type: 'duel_offer', fromId: 'foe', fromName: 'Foe' } as never);
    expect(onOffer).toHaveBeenLastCalledWith({ fromId: 'foe', fromName: 'Foe' });
    board.ingest({ type: 'duel_cancelled', otherId: 'foe' } as never);
    expect(onOffer).toHaveBeenLastCalledWith(null);
  });

  it('paints a white bubble with three dots, one lit at a time, over the player', () => {
    const rects: string[] = [];
    const ctx = { fillStyle: '', font: '', fillRect: (x: number, y: number, w: number, h: number) => void rects.push(`${ctx.fillStyle}|${w}x${h}`) };
    expect(paintDuelDots(ctx, viewBox('green', 300, 300, ZOOM_CLOSE), 300, 300, 0)).toBe(true);
    expect(rects.filter((r) => r.startsWith('#ffffff')).length).toBeGreaterThanOrEqual(2);
    expect(rects.filter((r) => r.includes('7x7'))).toHaveLength(3);
  });

  it('the page has the menu with Duel and Cancel', () => {
    expect(pageHtml).toContain('id="duel-menu"');
    expect(pageHtml).toContain('id="duel-menu-duel"');
    expect(pageHtml).toContain('id="duel-menu-cancel"');
  });

  it('a right click on the partner during a duel sends the walk-and-swing attack', () => {
    const orchard = { selfId: 'me', selfPlace: 'green' as const, duelPartnerId: 'foe', players: [{ id: 'me', x: 1, y: 1 }, { id: 'foe', x: 300, y: 300 }], monsters: [] };
    expect(peelClick({ x: 300, y: 280, button: 2 }, orchard).message).toEqual({ type: 'attack', playerId: 'foe', walk: true });
  });

  it('once the duel has started the partner is hit-tested like a monster: hover outline and hand cursor; before, nothing', () => {
    const sent: string[] = [];
    const board = plantFigBoard({ selfId: 'me', selfPlace: 'green', createSocket: () => lemon(sent) });
    board.ingest(snap([fig('me', 300, 300), fig('foe', 380, 300)]));
    expect(board.duelPartner()).toBeNull();
    board.ingest(snap([fig('me', 300, 300, 'foe'), fig('foe', 380, 300, 'me')]));
    expect(board.duelPartner()).toBe('foe');
    // A left click on the partner: walk and swing once; the same click on someone else only walks.
    board.click({ x: 380, y: 275, button: 0 });
    expect(JSON.parse(sent[0]!)).toEqual({ type: 'attack', playerId: 'foe', once: true, walk: true });
    board.click({ x: 480, y: 275, button: 0 });
    expect(JSON.parse(sent[1]!).type).toBe('move');
  });

  it('paints the white rounded outline around the partner body', () => {
    const calls: string[] = [];
    const ctx = {
      strokeStyle: '', lineWidth: 0, lineJoin: '',
      save: () => void calls.push('save'), restore: () => void calls.push('restore'),
      beginPath: () => void calls.push('begin'), stroke: () => void calls.push('stroke'),
      moveTo: () => void calls.push('m'), lineTo: () => void calls.push('l'), arcTo: () => void calls.push('a'), closePath: () => void calls.push('c'),
      quadraticCurveTo: () => void calls.push('q'), arc: () => void calls.push('arc'),
    };
    paintFigRim(ctx as never, 380, 300, viewBox('green', 300, 300, ZOOM_CLOSE));
    expect(calls[0]).toBe('save');
    expect(calls).toContain('stroke');
    expect(calls[calls.length - 1]).toBe('restore');
    expect(ctx.strokeStyle).not.toBe('');
  });
});
