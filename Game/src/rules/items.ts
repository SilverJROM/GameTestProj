// Owning a quince is separate from wearing it. Numbers still come from the gear table.
// buyItem spends coins and adds the id to the bag. It does not equip.
// The caller refuses a fig that is not in town. This module does not look at place.
// equipItem puts an owned quince into its own slot. unequipItem returns that slot to the bag.

import { maxHealth, type Hero } from './logic';
import { mangoGearRows, type GearRow, type GearSlot } from './tables';

export interface OwnedGear {
  readonly level: number;
  readonly health: number;
  readonly coins: number;
  readonly sword: string | null;
  readonly armor: string | null;
  readonly items: readonly string[];
  // Quince ids another avatar of the account wears. They count as owned for buying, and cannot be worn here.
  readonly elsewhere?: readonly string[];
}

export interface GearChange {
  readonly ok: boolean;
  readonly gear: OwnedGear;
}

function findQuince(itemId: string): GearRow | null {
  return mangoGearRows.find((candidate) => candidate.id === itemId) ?? null;
}

function sortedBag(items: readonly string[]): string[] {
  return [...items].sort();
}

// Max HP from the worn armor. A sword adds nothing here.
function melonMax(gear: OwnedGear): number {
  const hero: Hero = {
    level: gear.level,
    xp: 0,
    health: gear.health,
    coins: gear.coins,
    sword: gear.sword,
    armor: gear.armor,
    place: 'town',
  };
  return maxHealth(hero);
}

// A sword never moves current HP. Armor leaves HP where it is, then clamps it to the new max.
function healthAfter(before: OwnedGear, after: OwnedGear): number {
  if (after.sword !== before.sword && after.armor === before.armor) {
    return before.health;
  }
  return Math.min(before.health, melonMax(after));
}

function refuse(gear: OwnedGear): GearChange {
  return { ok: false, gear };
}

// Spend the price and put the quince in the bag. The worn slots stay as they are.
// Unknown, already owned, or a short purse comes back unchanged.
export function buyItem(gear: OwnedGear, itemId: string): GearChange {
  const quince = findQuince(itemId);
  if (quince === null) {
    return refuse(gear);
  }
  if (gear.items.includes(itemId) || (gear.elsewhere ?? []).includes(itemId)) {
    return refuse(gear);
  }
  if (gear.coins < quince.price) {
    return refuse(gear);
  }
  return {
    ok: true,
    gear: {
      ...gear,
      coins: gear.coins - quince.price,
      items: sortedBag([...gear.items, itemId]),
    },
  };
}

// Wear an owned quince in its own slot. A sword never lands in the armor slot.
// The quince that was in that slot is still owned, so it is back in the bag.
// A slot argument that does not match the quince is refused.
export function equipItem(gear: OwnedGear, itemId: string, slot?: GearSlot): GearChange {
  const quince = findQuince(itemId);
  if (quince === null) {
    return refuse(gear);
  }
  if (slot !== undefined && slot !== quince.slot) {
    return refuse(gear);
  }
  if (!gear.items.includes(itemId)) {
    return refuse(gear);
  }
  const worn = quince.slot === 'sword' ? gear.sword : gear.armor;
  if (worn === itemId) {
    return refuse(gear);
  }
  const next: OwnedGear = {
    ...gear,
    sword: quince.slot === 'sword' ? quince.id : gear.sword,
    armor: quince.slot === 'armor' ? quince.id : gear.armor,
  };
  return { ok: true, gear: { ...next, health: healthAfter(gear, next) } };
}

// Clear one worn slot. The quince stays in the bag. An empty slot changes nothing.
export function unequipItem(gear: OwnedGear, slot: string): GearChange {
  if (slot !== 'sword' && slot !== 'armor') {
    return refuse(gear);
  }
  if (slot === 'sword' && gear.sword === null) {
    return refuse(gear);
  }
  if (slot === 'armor' && gear.armor === null) {
    return refuse(gear);
  }
  const next: OwnedGear = {
    ...gear,
    sword: slot === 'sword' ? null : gear.sword,
    armor: slot === 'armor' ? null : gear.armor,
  };
  return { ok: true, gear: { ...next, health: healthAfter(gear, next) } };
}
