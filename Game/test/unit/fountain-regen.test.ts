// Fountain regeneration rule: 5 health per second in or near the town fountain, up to the maximum, living avatars only.
import { describe, expect, it } from 'vitest';
import { FOUNTAIN_REGEN_HP_PER_SEC, FOUNTAIN_REGEN_REACH_PX } from '../../src/rules/tables';
import { melonFountainBox, nearFountain } from '../../src/rules/regions';
import { regenAtFountain, sproutFig, type FigWalk } from '../../src/world/core';

const mid = { x: (melonFountainBox.x0 + melonFountainBox.x1) / 2, y: (melonFountainBox.y0 + melonFountainBox.y1) / 2 };

function fig(over: Partial<FigWalk['facts']> = {}): FigWalk {
  return sproutFig({
    id: 'f', name: 'F', nameKey: 'f', gender: 'woman', level: 1, xp: 0, hp: 40, maxHp: 70, coins: 0,
    sword: null, armor: null, place: 'town', x: mid.x, y: mid.y, ...over,
  });
}

describe('fountain regeneration', () => {
  it('is 5 health per second within 40 px of the fountain box', () => {
    expect(FOUNTAIN_REGEN_HP_PER_SEC).toBe(5);
    expect(FOUNTAIN_REGEN_REACH_PX).toBe(40);
    expect(nearFountain(mid.x, mid.y, 40)).toBe(true);
    expect(nearFountain(melonFountainBox.x1 + 40, mid.y, 40)).toBe(true);
    expect(nearFountain(melonFountainBox.x1 + 41, mid.y, 40)).toBe(false);
  });

  it('adds the carried fraction over ticks: 10 ticks of 100 ms give exactly 5', () => {
    const f = fig();
    const carry = new Map<string, number>();
    let rose = 0;
    for (let i = 0; i < 10; i += 1) if (regenAtFountain(f, 100, carry)) rose += 1;
    expect(f.facts.hp).toBe(45);
    expect(rose).toBe(5); // half a point a tick: whole points on every second tick
  });

  it('stops at the maximum, and never touches the dead, the wounded elsewhere, or other zones', () => {
    const carry = new Map<string, number>();
    const near = fig({ hp: 69 });
    for (let i = 0; i < 40; i += 1) regenAtFountain(near, 100, carry);
    expect(near.facts.hp).toBe(70);
    const dead = fig({ hp: 0 });
    expect(regenAtFountain(dead, 1000, carry)).toBe(false);
    expect(dead.facts.hp).toBe(0);
    const away = fig({ x: mid.x + 200 });
    expect(regenAtFountain(away, 1000, carry)).toBe(false);
    const green = fig({ place: 'green' });
    expect(regenAtFountain(green, 1000, carry)).toBe(false);
    expect(green.facts.hp).toBe(40);
  });
});
