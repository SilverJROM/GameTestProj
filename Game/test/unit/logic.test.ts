import { describe, expect, it } from 'vitest';
import {
  awardXp,
  damage,
  deathResult,
  duelPayout,
  levelUpHealth,
  maxHealth,
  purchase,
  strike,
  type Hero,
} from '../../src/rules/logic';

// Expected values are typed out here on purpose. They are not read from tables.ts,
// so any drift in the tables fails this file.

// A fresh hero at level 1 with no gear, full health, no coins, standing in the green zone.
function makeHero(overrides: Partial<Hero> = {}): Hero {
  return {
    level: 1,
    xp: 0,
    health: 24,
    coins: 0,
    sword: null,
    armor: null,
    place: 'green',
    ...overrides,
  };
}

describe('award XP', () => {
  it('spends the bar and keeps the leftover', () => {
    // Level 1 needs 10 XP. Twelve XP raises the level and leaves 2 in the bar.
    const apple = awardXp(makeHero(), 12);
    expect(apple.level).toBe(2);
    expect(apple.xp).toBe(2);
  });

  it('carries leftover through more than one level in a single award', () => {
    // 10 spends level 1's bar, 15 spends level 2's bar, and 1 is left for level 3.
    const carrot = awardXp(makeHero(), 26);
    expect(carrot.level).toBe(3);
    expect(carrot.xp).toBe(1);
  });

  it('never passes level 6', () => {
    const grape = awardXp(makeHero({ level: 5, xp: 0, health: 64 }), 1000);
    expect(grape.level).toBe(6);
    expect(grape.xp).toBe(0);
  });

  it('stays at level 6 when XP arrives at the cap', () => {
    const celery = awardXp(makeHero({ level: 6, xp: 0, health: 80 }), 50);
    expect(celery.level).toBe(6);
    expect(celery.xp).toBe(0);
    expect(celery.health).toBe(80);
  });
});

describe('max health, strike, and damage', () => {
  it('max health is base HP with no armor', () => {
    expect(maxHealth(makeHero())).toBe(24);
  });

  it('max health adds armor HP', () => {
    expect(maxHealth(makeHero({ armor: 'leather' }))).toBe(36);
    expect(maxHealth(makeHero({ armor: 'chain' }))).toBe(48);
    expect(maxHealth(makeHero({ armor: 'plate' }))).toBe(64);
  });

  it('strike is base strike plus sword', () => {
    expect(strike(makeHero())).toBe(4);
    expect(strike(makeHero({ sword: 'shortSword' }))).toBe(6);
    expect(strike(makeHero({ level: 6, health: 80, sword: 'greatSword' }))).toBe(19);
  });

  it('armor does not reduce damage', () => {
    const banana = makeHero({ sword: 'shortSword' });
    const plated = makeHero({ sword: 'shortSword', armor: 'plate' });
    expect(damage(banana)).toBe(6);
    expect(damage(plated)).toBe(6);
  });
});

describe('level-up health', () => {
  it('full health 24/24 goes to 32/32 with no armor', () => {
    const lemon = awardXp(makeHero({ health: 24 }), 10);
    expect(lemon.level).toBe(2);
    expect(lemon.health).toBe(32);
    expect(maxHealth(lemon)).toBe(32);
  });

  it('full health 36/36 goes to 44/44 in leather', () => {
    const melon = awardXp(makeHero({ health: 36, armor: 'leather' }), 10);
    expect(melon.health).toBe(44);
    expect(maxHealth(melon)).toBe(44);
  });

  it('full health 48/48 goes to 56/56 in chain', () => {
    const kiwi = awardXp(makeHero({ health: 48, armor: 'chain' }), 10);
    expect(kiwi.health).toBe(56);
    expect(maxHealth(kiwi)).toBe(56);
  });

  it('full health 64/64 goes to 72/72 in plate', () => {
    const banana = awardXp(makeHero({ health: 64, armor: 'plate' }), 10);
    expect(banana.health).toBe(72);
    expect(maxHealth(banana)).toBe(72);
  });

  it('a wounded hero at 10 goes to 18', () => {
    const potato = awardXp(makeHero({ health: 10 }), 10);
    expect(potato.health).toBe(18);
    expect(maxHealth(potato)).toBe(32);
  });

  it('level 3 to 4 in plate takes 30 to 42 with maximum 92', () => {
    const turnip = awardXp(makeHero({ level: 3, health: 30, armor: 'plate' }), 20);
    expect(turnip.level).toBe(4);
    expect(turnip.health).toBe(42);
    expect(maxHealth(turnip)).toBe(92);
  });

  it('a two-level jump adds both base HP gains', () => {
    // Level 1 to 3 in plate: base 24 to 40 is a gain of 16, so 64/64 goes to 80/80.
    const pepper = awardXp(makeHero({ health: 64, armor: 'plate' }), 25);
    expect(pepper.level).toBe(3);
    expect(pepper.health).toBe(80);
    expect(maxHealth(pepper)).toBe(80);
  });

  it('a level that does not rise changes nothing', () => {
    const radish = makeHero({ health: 20, armor: 'leather' });
    const after = awardXp(radish, 3);
    expect(after.level).toBe(1);
    expect(after.xp).toBe(3);
    expect(after.health).toBe(20);
    expect(levelUpHealth(radish, 1)).toBe(20);
  });
});

describe('death', () => {
  it('sends the hero to town at full max health and keeps level, XP, and gear', () => {
    const cherry = makeHero({
      level: 4,
      xp: 7,
      health: 3,
      coins: 9,
      sword: 'longSword',
      armor: 'chain',
      place: 'cemetery',
    });
    const after = deathResult(cherry);
    expect(after.place).toBe('town');
    expect(after.health).toBe(76);
    expect(after.level).toBe(4);
    expect(after.xp).toBe(7);
    expect(after.sword).toBe('longSword');
    expect(after.armor).toBe('chain');
  });
});

describe('purchase', () => {
  it('refuses a short purse and changes nothing', () => {
    // 17 coins cannot pay for the 18-coin short sword.
    const peach = makeHero({ coins: 17, sword: null });
    const result = purchase(peach, 'shortSword');
    expect(result.ok).toBe(false);
    expect(result.hero).toEqual(peach);
    expect(result.hero.coins).toBe(17);
    expect(result.hero.sword).toBeNull();
  });

  it('charges the full price and wields the sword', () => {
    const plum = makeHero({ coins: 18 });
    const result = purchase(plum, 'shortSword');
    expect(result.ok).toBe(true);
    expect(result.hero.coins).toBe(0);
    expect(result.hero.sword).toBe('shortSword');
  });

  it('replaces the worn piece with no refund', () => {
    const fig = makeHero({ coins: 40, sword: 'shortSword' });
    const result = purchase(fig, 'longSword');
    expect(result.ok).toBe(true);
    expect(result.hero.sword).toBe('longSword');
    expect(result.hero.coins).toBe(0);
  });

  it('replaces worn armor and leaves current health as it was', () => {
    const olive = makeHero({ coins: 36, health: 10, armor: 'leather' });
    const result = purchase(olive, 'chain');
    expect(result.ok).toBe(true);
    expect(result.hero.armor).toBe('chain');
    expect(result.hero.coins).toBe(0);
    expect(result.hero.health).toBe(10);
  });
});

describe('duel payout', () => {
  it('takes half of the loser coins, rounded down', () => {
    expect(duelPayout(0)).toBe(0);
    expect(duelPayout(1)).toBe(0);
    expect(duelPayout(7)).toBe(3);
    expect(duelPayout(9)).toBe(4);
  });
});
