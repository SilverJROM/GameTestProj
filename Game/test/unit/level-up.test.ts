// Level up: a bright burst and a rising "Level N" plate over the avatar, for about 3 seconds, only when the level rises.
import { describe, expect, it, vi } from 'vitest';
import { viewBox } from '../../src/client/camera';
import { plantFigBoard } from '../../src/client/main';
import { LEVEL_UP_MS, paintLevelUp, type LevelUpCtx } from '../../src/client/view';

function recorder() {
  const texts: Array<{ text: string; x: number; y: number }> = [];
  const rects: Array<{ x: number; y: number; w: number; h: number; style: string }> = [];
  const ctx: LevelUpCtx = {
    fillStyle: '',
    font: '',
    globalAlpha: 1,
    fillRect(x, y, w, h) {
      rects.push({ x, y, w, h, style: String(ctx.fillStyle) });
    },
    fillText(text, x, y) {
      texts.push({ text, x, y });
    },
  };
  return { ctx, texts, rects };
}

function snap(level: number) {
  return {
    type: 'snapshot' as const,
    character: { id: 'fig-self', place: 'green' as const, gender: 'woman' as const, level, xp: 0, hp: 70, maxHp: 70 },
    snapshot: {
      players: [{ id: 'fig-self', name: 'fig-self', x: 900, y: 400, facing: 'right' as const, moving: false, place: 'green' as const, duelPartnerId: null, gender: 'woman' as const, attacking: false }],
      monsters: [],
      coins: [],
      pickups: [],
    },
  };
}

describe('level up effect', () => {
  it('draws the burst and a Level N plate that rises, then ends after LEVEL_UP_MS', () => {
    const early = recorder();
    expect(paintLevelUp(early.ctx, 2, 1000, { x: 640, y: 400 }, 2, 1300)).toBe(true);
    expect(early.texts.map((row) => row.text)).toEqual(['Level 2']);
    const later = recorder();
    expect(paintLevelUp(later.ctx, 2, 1000, { x: 640, y: 400 }, 2, 2200)).toBe(true);
    // The plate rises: its text is higher on screen later than earlier.
    expect(later.texts[0]!.y).toBeLessThan(early.texts[0]!.y);
    // The plate sits above the head (feet y 400, sprite about 58 map px high at scale 2).
    expect(early.texts[0]!.y).toBeLessThan(400 - 58 * 2);
    expect(early.rects.some((row) => row.style.includes('#') || row.style.includes('rgba'))).toBe(true);
    expect(paintLevelUp(recorder().ctx, 2, 1000, { x: 640, y: 400 }, 2, 1000 + LEVEL_UP_MS)).toBe(false);
    expect(paintLevelUp(recorder().ctx, 2, 1000, { x: 640, y: 400 }, 2, 900)).toBe(false);
  });

  it('starts on a level rise after the first picture, not on the first picture or an unchanged level', () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const board = plantFigBoard({ selfId: 'fig-self', selfPlace: 'green', createSocket: () => ({ send() {}, close() {}, addEventListener() {} }) });
    board.ingest(snap(3));
    expect(board.levelUpShowing(10_000)).toBe(false);
    board.ingest(snap(3));
    expect(board.levelUpShowing(10_000)).toBe(false);
    board.ingest(snap(4));
    expect(board.levelUpShowing(10_000)).toBe(true);
    const view = viewBox('green', 900, 400);
    const { ctx, texts } = recorder();
    board.paintLevelUp(ctx, view, 10_400);
    expect(texts.map((row) => row.text)).toEqual(['Level 4']);
    expect(board.levelUpShowing(10_000 + LEVEL_UP_MS)).toBe(false);
    vi.useRealTimers();
  });
});
