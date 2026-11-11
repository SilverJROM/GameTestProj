import { describe, expect, it } from 'vitest';
import {
  awardXp,
  damage,
  deathResult,
  duelPayout,
  levelUpHealth,
  maxHealth,
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
    health: 70,
    coins: 0,
    sword: null,
    armor: null,
    place: 'green',
    ...overrides,
  };
}

describe('award XP', () => {
  it('spends the bar and keeps the leftover', () => {
    // Level 1 needs 200 XP. 212 XP raises the level and leaves 12 in the bar.
    const apple = awardXp(makeHero(), 212);
    expect(apple.level).toBe(2);
    expect(apple.xp).toBe(12);
  });

  it('carries leftover through more than one level in a single award', () => {
    // 200 spends level 1's bar, 400 spends level 2's bar, and 1 is left for level 3.
    const carrot = awardXp(makeHero(), 601);
    expect(carrot.level).toBe(3);
    expect(carrot.xp).toBe(1);
  });

  it('never passes level 6', () => {
    const grape = awardXp(makeHero({ level: 5, xp: 0, health: 122 }), 100000);
    expect(grape.level).toBe(6);
    expect(grape.xp).toBe(0);
  });

  it('stays at level 6 when XP arrives at the cap', () => {
    const celery = awardXp(makeHero({ level: 6, xp: 0, health: 140 }), 50);
    expect(celery.level).toBe(6);
    expect(celery.xp).toBe(0);
    expect(celery.health).toBe(140);
  });
});

describe('max health, strike, and damage', () => {
  it('max health is base HP with no armor', () => {
    expect(maxHealth(makeHero())).toBe(70);
  });

  it('max health adds armor HP', () => {
    expect(maxHealth(makeHero({ armor: 'leather' }))).toBe(82);
    expect(maxHealth(makeHero({ armor: 'chain' }))).toBe(94);
    expect(maxHealth(makeHero({ armor: 'plate' }))).toBe(110);
  });

  it('strike is base strike plus sword', () => {
    expect(strike(makeHero())).toBe(4);
    expect(strike(makeHero({ sword: 'shortSword' }))).toBe(6);
    expect(strike(makeHero({ level: 6, health: 140, sword: 'greatSword' }))).toBe(19);
  });

  it('armor does not reduce damage', () => {
    const banana = makeHero({ sword: 'shortSword' });
    const plated = makeHero({ sword: 'shortSword', armor: 'plate' });
    expect(damage(banana)).toBe(6);
    expect(damage(plated)).toBe(6);
  });
});

describe('level-up health', () => {
  it('full health 70/70 goes to 80/80 with no armor', () => {
    const lemon = awardXp(makeHero({ health: 70 }), 200);
    expect(lemon.level).toBe(2);
    expect(lemon.health).toBe(80);
    expect(maxHealth(lemon)).toBe(80);
  });

  it('full health 82/82 goes to 92/92 in leather', () => {
    const melon = awardXp(makeHero({ health: 82, armor: 'leather' }), 200);
    expect(melon.health).toBe(92);
    expect(maxHealth(melon)).toBe(92);
  });

  it('full health 94/94 goes to 104/104 in chain', () => {
    const kiwi = awardXp(makeHero({ health: 94, armor: 'chain' }), 200);
    expect(kiwi.health).toBe(104);
    expect(maxHealth(kiwi)).toBe(104);
  });

  it('full health 110/110 goes to 120/120 in plate', () => {
    const banana = awardXp(makeHero({ health: 110, armor: 'plate' }), 200);
    expect(banana.health).toBe(120);
    expect(maxHealth(banana)).toBe(120);
  });

  it('a wounded hero at 10 goes to 20', () => {
    const potato = awardXp(makeHero({ health: 10 }), 200);
    expect(potato.health).toBe(20);
    expect(maxHealth(potato)).toBe(80);
  });

  it('level 3 to 4 in plate takes 30 to 44 with maximum 146', () => {
    const turnip = awardXp(makeHero({ level: 3, health: 30, armor: 'plate' }), 900);
    expect(turnip.level).toBe(4);
    expect(turnip.health).toBe(44);
    expect(maxHealth(turnip)).toBe(146);
  });

  it('a two-level jump adds both base HP gains', () => {
    // Level 1 to 3 in plate: base 70 to 92 is a gain of 22, so 110/110 goes to 132/132.
    const pepper = awardXp(makeHero({ health: 110, armor: 'plate' }), 600);
    expect(pepper.level).toBe(3);
    expect(pepper.health).toBe(132);
    expect(maxHealth(pepper)).toBe(132);
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

describe('five fights worth 40 xp at level 1', () => {
  it('ends the fifth fight at 20/70 and enters level 2 at 30/80', () => {
    let hero = makeHero();
    expect(Math.ceil(20 / damage(hero))).toBe(5);
    let beforeLastLevel = hero;
    for (let wolf = 0; wolf < 5; wolf += 1) {
      hero = { ...hero, health: hero.health - 10 };
      if (wolf === 4) {
        beforeLastLevel = hero;
      }
      hero = awardXp(hero, 40);
    }
    expect(beforeLastLevel.level).toBe(1);
    expect(beforeLastLevel.health).toBe(20);
    expect(maxHealth(beforeLastLevel)).toBe(70);
    expect(hero.level).toBe(2);
    expect(hero.xp).toBe(0);
    expect(hero.health).toBe(30);
    expect(maxHealth(hero)).toBe(80);
    expect(hero.health).toBeGreaterThanOrEqual(70 / 4);
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
    expect(after.health).toBe(130);
    expect(after.level).toBe(4);
    expect(after.xp).toBe(7);
    expect(after.sword).toBe('longSword');
    expect(after.armor).toBe('chain');
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
