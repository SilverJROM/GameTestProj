// Pets: dog, cat and tiger cub 30% each, axolotl 10%, picked from the avatar's own id (stable), drawn at the axolotl's size.
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createOliveReel, paintOrchard } from '../../src/client/view';
import { PET_ODDS, petFor, type PetKind } from '../../src/rules/pets';

describe('pet odds', () => {
  it('add up to 100 percent with the dog, cat and tiger at 30 and the axolotl at 10', () => {
    expect(PET_ODDS.reduce((sum, row) => sum + row.percent, 0)).toBe(100);
    expect(Object.fromEntries(PET_ODDS.map((row) => [row.pet, row.percent]))).toEqual({ dog: 30, cat: 30, tiger: 30, axolotl: 10 });
  });

  it('gives the same pet for the same avatar every time', () => {
    for (let i = 0; i < 50; i += 1) {
      const id = randomUUID();
      expect(petFor(id)).toBe(petFor(id));
    }
  });

  it('hands out about 30 / 30 / 30 / 10 over many new avatars', () => {
    const counts: Record<PetKind, number> = { dog: 0, cat: 0, tiger: 0, axolotl: 0 };
    const total = 20000;
    for (let i = 0; i < total; i += 1) counts[petFor(randomUUID())] += 1;
    for (const row of PET_ODDS) {
      const share = (counts[row.pet] / total) * 100;
      expect(Math.abs(share - row.percent), row.pet).toBeLessThan(1.5);
    }
  });
});

describe('pet picture', () => {
  it('draws each avatar with its own pet, all at the same height, and the axolotl when none is named', () => {
    const reel = createOliveReel();
    const fig = (id: string, pet?: PetKind) => ({
      id, name: id, x: 100, y: 100, facing: 'right' as const, moving: false, place: 'green' as const, duelPartnerId: null, gender: 'woman' as const, ...(pet ? { pet } : {}),
    });
    const stills = paintOrchard(reel, { players: [fig('a', 'dog'), fig('b', 'cat'), fig('c', 'tiger'), fig('d', 'axolotl'), fig('e')], monsters: [], coins: [], pickups: [] });
    const pets = stills.filter((row) => row.role === 'pet');
    expect(pets.map((row) => row.src)).toEqual([
      '/avatars/dog/stand.png', '/avatars/cat/stand.png', '/avatars/tiger/stand.png', '/avatars/axolotl/stand.png', '/avatars/axolotl/stand.png',
    ]);
    expect(new Set(pets.map((row) => row.height)).size).toBe(1);
  });
});
