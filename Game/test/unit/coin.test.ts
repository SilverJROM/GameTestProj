// One seed per kill, worth the row's coins, collected after pearTimings.coinPickupSeconds.
import { describe, expect, it } from 'vitest';
import { kaleConstants, onionMonsterRows, pearTimings } from '../../src/rules/tables';
import type { CharacterFacts } from '../../src/server/db';
import { sproutFig } from '../../src/world/core';
import { hurtBeet, plantCabbage, readCabbage } from '../../src/world/monsters';
import { stepPickups, type RadishDigs } from '../../src/world/pets';

const tickMs = kaleConstants.tickMs;
const ticksBeforePay = Math.ceil((pearTimings.coinPickupSeconds * 1000) / tickMs) - 1;

function figOf(id: string, coins: number, x = 10, y = 20) {
  const facts: CharacterFacts = {
    id,
    name: id,
    nameKey: id,
    gender: 'woman',
    level: 1,
    xp: 0,
    hp: 70,
    maxHp: 70,
    coins,
    sword: null,
    armor: null,
    place: 'green',
    x,
    y,
  };
  return sproutFig(facts);
}

describe('one coin seed per kill', () => {
  it('drops one seed worth the row coins for a wolf, a bear, and a skeleton', () => {
    let bed = plantCabbage();
    const killer = 'fig-killer';
    for (const row of onionMonsterRows) {
      const beet = bed.beets.find((candidate) => candidate.kind === row.id)!;
      const before = bed.seeds.length;
      const hit = hurtBeet(bed, beet.id, beet.hp, killer, 1_000);
      expect(hit.felled).toBe(true);
      bed = hit.bed;
      expect(bed.seeds.slice(before)).toEqual([
        expect.objectContaining({ ownerId: killer, x: beet.x, y: beet.y, value: row.coins }),
      ]);
    }
    expect(bed.seeds).toHaveLength(onionMonsterRows.length);
  });

  it('reads a stored seed with no value as one coin', () => {
    const fresh = plantCabbage();
    const wolf = fresh.beets.find((beet) => beet.kind === 'wolf')!;
    const wolfCoins = onionMonsterRows.find((row) => row.id === 'wolf')!.coins;
    const felled = hurtBeet(fresh, wolf.id, wolf.hp, 'fig-killer', 0).bed;
    expect(readCabbage(felled)!.seeds[0]!.value).toBe(wolfCoins);
    const stored = JSON.parse(JSON.stringify(felled)) as { seeds: Array<Record<string, unknown>> };
    delete stored.seeds[0]!.value;
    const read = readCabbage(stored);
    expect(read!.seeds[0]).toMatchObject({ id: felled.seeds[0]!.id, ownerId: 'fig-killer', value: 1 });
  });
});

describe('purse credit for one seed', () => {
  it('adds the whole value after pickupSeconds and not before, in one coins write', () => {
    const row = onionMonsterRows.find((candidate) => candidate.id === 'bear')!;
    const beet = plantCabbage().beets.find((candidate) => candidate.kind === row.id)!;
    let bed = hurtBeet(plantCabbage(), beet.id, beet.hp, 'owner', 0).bed;
    const owner = figOf('owner', 2, beet.x, beet.y);
    const other = figOf('other', 9, beet.x, beet.y);
    const figs = new Map([
      [owner.facts.id, owner],
      [other.facts.id, other],
    ]);
    const digs: RadishDigs = new Map();
    const connectedAt = new Map([
      ['owner', 0],
      ['other', 0],
    ]);

    for (let tick = 1; tick <= ticksBeforePay; tick += 1) {
      owner.facts = { ...owner.facts, x: owner.facts.x + 3, y: owner.facts.y + 1 };
      const step = stepPickups(bed, digs, figs, connectedAt, tick * tickMs);
      bed = step.bed;
      expect(step.writes).toEqual([]);
      expect(owner.facts.coins).toBe(2);
      expect(other.facts.coins).toBe(9);
      expect(bed.seeds).toHaveLength(1);
    }
    expect((ticksBeforePay * tickMs) / 1000).toBeLessThan(pearTimings.coinPickupSeconds);

    const paid = stepPickups(bed, digs, figs, connectedAt, (ticksBeforePay + 1) * tickMs);
    expect(paid.writes).toEqual([{ id: 'owner', patch: { coins: 2 + row.coins } }]);
    expect(Object.keys(paid.writes[0]!.patch)).toEqual(['coins']);
    expect(owner.facts.coins).toBe(2 + row.coins);
    expect(other.facts.coins).toBe(9);
    expect(paid.bed.seeds).toEqual([]);
    expect((ticksBeforePay + 1) * tickMs).toBeGreaterThanOrEqual(pearTimings.coinPickupSeconds * 1000);
  });

  it('leaves a seed alone when its owner is not connected', () => {
    const row = onionMonsterRows.find((candidate) => candidate.id === 'skeleton')!;
    const beet = plantCabbage().beets.find((candidate) => candidate.kind === row.id)!;
    let bed = hurtBeet(plantCabbage(), beet.id, beet.hp, 'away', 0).bed;
    const bystander = figOf('bystander', 1);
    const figs = new Map([[bystander.facts.id, bystander]]);
    const digs: RadishDigs = new Map();
    const connectedAt = new Map([['bystander', 0]]);
    for (let tick = 1; tick <= ticksBeforePay + 3; tick += 1) {
      const step = stepPickups(bed, digs, figs, connectedAt, tick * tickMs);
      bed = step.bed;
      expect(step.writes).toEqual([]);
    }
    expect(bed.seeds).toHaveLength(1);
    expect(bed.seeds[0]!.value).toBe(row.coins);
    expect(bystander.facts.coins).toBe(1);
  });
});
