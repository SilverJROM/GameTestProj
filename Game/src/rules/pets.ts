// Pets (plan 13). Every avatar has one pet, picked at random with fixed odds: dog, cat and tiger cub 30% each, axolotl 10%.
// The pick is made from the avatar's own random id, so it is stable (the same avatar always has the same pet) without a
// database column, and a new avatar is equally likely to get any of the odds. Pure: the same id always gives the same pet.

export type PetKind = 'axolotl' | 'dog' | 'cat' | 'tiger';

// Cumulative order matters only for which slice of 0..1 each pet owns.
export const PET_ODDS: ReadonlyArray<{ readonly pet: PetKind; readonly percent: number }> = [
  { pet: 'dog', percent: 30 },
  { pet: 'cat', percent: 30 },
  { pet: 'tiger', percent: 30 },
  { pet: 'axolotl', percent: 10 },
];

// FNV-1a over the id, then a final mix, mapped to [0, 1).
function rollOf(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b) >>> 0;
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35) >>> 0;
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967296;
}

export function petFor(avatarId: string): PetKind {
  const roll = rollOf(avatarId) * 100;
  let edge = 0;
  for (const row of PET_ODDS) {
    edge += row.percent;
    if (roll < edge) return row.pet;
  }
  return 'axolotl';
}
