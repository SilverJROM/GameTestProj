// Bag rules. Buying adds a quince and does not wear it.
// Equipping wears an owned quince in its own slot. Unequipping puts it back.
// Strike and max health follow only the worn quince.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { peelClientMessage } from '../../src/protocol';
import { buyItem, equipItem, unequipItem, type OwnedGear } from '../../src/rules/items';
import { maxHealth, strike, type Hero } from '../../src/rules/logic';
import { mangoGearRows } from '../../src/rules/tables';
import { migrationStatements } from '../helpers/orchard';

function gear(overrides: Partial<OwnedGear> = {}): OwnedGear {
  return {
    level: 1,
    health: 70,
    coins: 0,
    sword: null,
    armor: null,
    items: [],
    ...overrides,
  };
}

function heroOf(row: OwnedGear): Hero {
  return {
    level: row.level,
    xp: 0,
    health: row.health,
    coins: row.coins,
    sword: row.sword,
    armor: row.armor,
    place: 'town',
  };
}

describe('migration 0003', () => {
  it('parses as one create statement after comments are stripped', () => {
    const sql = readFileSync(new URL('../../migrations/0003_items.sql', import.meta.url), 'utf8');
    const statements = migrationStatements(sql);
    expect(statements).toHaveLength(1);
    expect(statements[0]).toContain('CREATE TABLE character_items');
    expect(statements[0]).toContain('REFERENCES characters(id) ON DELETE CASCADE');
    expect(statements[0]).toContain('PRIMARY KEY (character_id, item_id)');
    expect(statements[0]).not.toContain('--');
  });
});

describe('buyItem', () => {
  it('spends coins, adds the quince to the bag, and does not equip it', () => {
    const before = gear({ coins: 18, health: 40 });
    const result = buyItem(before, 'shortSword');
    expect(result.ok).toBe(true);
    expect(result.gear.coins).toBe(0);
    expect(result.gear.items).toEqual(['shortSword']);
    expect(result.gear.sword).toBeNull();
    expect(result.gear.armor).toBeNull();
    expect(result.gear.health).toBe(40);
    expect(strike(heroOf(result.gear))).toBe(strike(heroOf(before)));
  });

  it('refuses an unknown quince, a copy, or a short purse and changes nothing', () => {
    const shortPurse = gear({ coins: 17 });
    expect(buyItem(shortPurse, 'shortSword')).toEqual({ ok: false, gear: shortPurse });

    const owned = gear({ coins: 80, items: ['shortSword'] });
    expect(buyItem(owned, 'shortSword')).toEqual({ ok: false, gear: owned });
    expect(buyItem(owned, 'shortSword').gear.coins).toBe(80);

    const rich = gear({ coins: 80 });
    expect(buyItem(rich, 'coconutHelm')).toEqual({ ok: false, gear: rich });
  });

  it('can own every quince without wearing any of them', () => {
    let row = gear({ coins: 18 + 40 + 70 + 16 + 36 + 64 });
    for (const quince of mangoGearRows) {
      const bought = buyItem(row, quince.id);
      expect(bought.ok).toBe(true);
      row = bought.gear;
    }
    expect(row.items).toEqual([...mangoGearRows.map((quince) => quince.id)].sort());
    expect(row.sword).toBeNull();
    expect(row.armor).toBeNull();
    expect(row.coins).toBe(0);
  });
});

describe('equipItem and unequipItem', () => {
  it('wears each sword and armor, and a bare slot adds nothing', () => {
    const bare = heroOf(gear());
    expect(strike(bare)).toBe(4);
    expect(maxHealth(bare)).toBe(70);
    for (const quince of mangoGearRows) {
      const worn = equipItem(gear({ items: [quince.id], coins: 0 }), quince.id);
      expect(worn.ok).toBe(true);
      const hero = heroOf(worn.gear);
      if (quince.slot === 'sword') {
        expect(worn.gear.sword).toBe(quince.id);
        expect(worn.gear.armor).toBeNull();
        expect(strike(hero)).toBe(4 + quince.amount);
        expect(maxHealth(hero)).toBe(70);
      } else {
        expect(worn.gear.armor).toBe(quince.id);
        expect(worn.gear.sword).toBeNull();
        expect(maxHealth(hero)).toBe(70 + quince.amount);
        expect(strike(hero)).toBe(4);
      }
      const stowed = unequipItem(worn.gear, quince.slot);
      expect(stowed.ok).toBe(true);
      expect(stowed.gear.items).toEqual([quince.id]);
      expect(strike(heroOf(stowed.gear))).toBe(4);
      expect(maxHealth(heroOf(stowed.gear))).toBe(70);
    }
  });

  it('refuses an unowned quince and a sword aimed at the armor slot', () => {
    const bag = gear({ armor: 'leather', items: ['shortSword', 'leather'] });
    const unowned = equipItem(bag, 'greatSword');
    expect(unowned.ok).toBe(false);
    expect(unowned.gear).toEqual(bag);

    const wrongSlot = equipItem(bag, 'shortSword', 'armor');
    expect(wrongSlot.ok).toBe(false);
    expect(wrongSlot.gear).toEqual(bag);
    expect(wrongSlot.gear.armor).toBe('leather');
    expect(wrongSlot.gear.sword).toBeNull();

    const unknown = equipItem(bag, 'coconutHelm', 'armor');
    expect(unknown.ok).toBe(false);
    expect(unknown.gear).toEqual(bag);
  });

  it('returns the worn quince to the bag when another one takes the slot', () => {
    const bag = gear({ items: ['shortSword', 'longSword'], sword: 'shortSword', health: 40 });
    const worn = equipItem(bag, 'longSword');
    expect(worn.ok).toBe(true);
    expect(worn.gear.sword).toBe('longSword');
    expect(worn.gear.items).toEqual(['shortSword', 'longSword']);
    expect(worn.gear.health).toBe(40);
    expect(strike(heroOf(worn.gear))).toBe(8);
  });

  it('raises max HP on armor equip without healing, and clamps when the max falls', () => {
    const wounded = gear({ health: 40, items: ['leather'] });
    expect(maxHealth(heroOf(wounded))).toBe(70);
    const leather = equipItem(wounded, 'leather');
    expect(leather.ok).toBe(true);
    expect(leather.gear.health).toBe(40);
    expect(maxHealth(heroOf(leather.gear))).toBe(82);

    const stowed = unequipItem(leather.gear, 'armor');
    expect(stowed.ok).toBe(true);
    expect(stowed.gear.health).toBe(40);
    expect(stowed.gear.armor).toBeNull();
    expect(maxHealth(heroOf(stowed.gear))).toBe(70);

    const full = gear({ health: 82, armor: 'leather', items: ['leather'] });
    const clamped = unequipItem(full, 'armor');
    expect(clamped.ok).toBe(true);
    expect(clamped.gear.health).toBe(70);
    expect(maxHealth(heroOf(clamped.gear))).toBe(70);

    const plated = gear({ health: 100, armor: 'plate', items: ['plate', 'leather'] });
    const down = equipItem(plated, 'leather');
    expect(down.ok).toBe(true);
    expect(down.gear.armor).toBe('leather');
    expect(down.gear.items).toEqual(['plate', 'leather']);
    expect(down.gear.health).toBe(82);
    expect(maxHealth(heroOf(down.gear))).toBe(82);
  });

  it('does not change HP when a sword is equipped or unequipped', () => {
    const wounded = gear({ health: 40, items: ['shortSword', 'leather'], armor: 'leather' });
    const worn = equipItem(wounded, 'shortSword');
    expect(worn.ok).toBe(true);
    expect(worn.gear.health).toBe(40);
    expect(worn.gear.sword).toBe('shortSword');
    expect(worn.gear.armor).toBe('leather');
    expect(maxHealth(heroOf(worn.gear))).toBe(82);

    const stowed = unequipItem(worn.gear, 'sword');
    expect(stowed.ok).toBe(true);
    expect(stowed.gear.health).toBe(40);
    expect(stowed.gear.sword).toBeNull();
    expect(stowed.gear.armor).toBe('leather');
    expect(maxHealth(heroOf(stowed.gear))).toBe(82);
  });
});

describe('equip and unequip messages', () => {
  it('peels equip and unequip and drops a radish id', () => {
    expect(
      peelClientMessage(
        JSON.stringify({
          type: 'equip',
          itemId: 'shortSword',
          id: 'radish-fig',
          characterId: 'radish-fig',
          character_id: 'radish-fig',
          characterid: 'radish-fig',
        }),
      ),
    ).toEqual({ type: 'equip', itemId: 'shortSword' });
    expect(peelClientMessage(JSON.stringify({ type: 'equip', itemId: 'shortSword', slot: 'armor' }))).toEqual({
      type: 'equip',
      itemId: 'shortSword',
      slot: 'armor',
    });
    expect(peelClientMessage(JSON.stringify({ type: 'unequip', slot: 'armor', id: 'radish-fig' }))).toEqual({
      type: 'unequip',
      slot: 'armor',
    });
    expect(peelClientMessage(JSON.stringify({ type: 'equip', itemId: '' }))).toBeNull();
    expect(peelClientMessage(JSON.stringify({ type: 'equip', item: 'shortSword' }))).toBeNull();
    expect(peelClientMessage(JSON.stringify({ type: 'unequip', slot: 'helmet' }))).toBeNull();
    expect(peelClientMessage(JSON.stringify({ type: 'equip', itemId: 'shortSword', slot: 'helm' }))).toBeNull();
  });
});
