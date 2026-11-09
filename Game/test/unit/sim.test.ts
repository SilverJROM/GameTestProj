import { describe, expect, it } from 'vitest';
import { duelPayout, purchase, onionMonsterRows } from '../../src/rules';
import { duelOne, huntOne, huntTwo, runAllScenarios, startingHero } from '../../src/sim/sim';

describe('scenario one: unarmed level 1 hunting wolves', () => {
  it('five wolves take a level 1 character to level 2 with coins for the short sword', () => {
    // Five wolves are 10 XP, which is exactly level 1's bar. Five wolves are 20 coins.
    const apple = huntOne(7);
    expect(apple.died).toBe(false);
    expect(apple.kills).toBe(5);
    expect(apple.hero.level).toBe(2);
    expect(apple.hero.xp).toBe(0);
    expect(apple.hero.coins).toBe(20);
    expect(purchase(apple.hero, 'shortSword').ok).toBe(true);
  });

  it('gives the same output for the same seed', () => {
    expect(huntOne(7)).toEqual(huntOne(7));
  });

  it('changes the printed coins when wolf coins are overridden, with no edit to the table', () => {
    const banana = huntOne(7, { wolf: { coins: 9 } });
    expect(banana.hero.coins).toBe(45);
    expect(banana.hero.level).toBe(2);
    // The rules table itself still holds the original wolf coins.
    expect(onionMonsterRows.find((row) => row.id === 'wolf')?.coins).toBe(4);
  });
});

describe('scenario two: geared character hunting a bear', () => {
  it('takes the bear kills with the gear and level given as arguments', () => {
    const cherry = huntTwo(7);
    expect(cherry.died).toBe(false);
    expect(cherry.kills).toBe(3);
    expect(cherry.hero.level).toBe(3);
    expect(cherry.hero.xp).toBe(15);
    expect(cherry.hero.coins).toBe(30);
    expect(cherry.hero.health).toBeGreaterThan(0);
  });

  it('gives the same output for the same seed', () => {
    expect(huntTwo(7)).toEqual(huntTwo(7));
  });
});

describe('scenario three: one duel between two builds', () => {
  it('ends with one winner, the loser in town at full health, and the winner gaining the payout', () => {
    const fig = duelOne(7);
    const loser = fig.winner === 'first' ? fig.second : fig.first;
    const winner = fig.winner === 'first' ? fig.first : fig.second;
    expect(loser.health).toBe(loser.level === 1 ? 24 : 52);
    expect(loser.place).toBe('town');
    expect(winner.health).toBeGreaterThan(0);
    // Starting purses: first 9 coins, second 30. The winner gains half the loser's purse, rounded down.
    const winnerStartCoins = fig.winner === 'first' ? 9 : 30;
    const loserStartCoins = fig.winner === 'first' ? 30 : 9;
    expect(winner.coins).toBe(winnerStartCoins + duelPayout(loserStartCoins));
  });

  it('gives the same output for the same seed', () => {
    expect(duelOne(7)).toEqual(duelOne(7));
  });
});

describe('whole sim', () => {
  it('two runs with the same seed print identical stats', () => {
    expect(runAllScenarios(7)).toEqual(runAllScenarios(7));
  });

  it('starts a character at full health for its level and gear', () => {
    expect(startingHero({ level: 3, armor: 'leather' }).health).toBe(52);
  });
});
