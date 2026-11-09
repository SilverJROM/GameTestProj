// Pure fig placement. No clock, no sockets, no database.
// A stored pear x,y is the join spot. A reload stays there and is never slid onto a zone spawn.
// A brand-new row has no stored pair yet, so it uses townSpawn from the regions module.

import type { CharacterFacts } from '../server/db';
import { townSpawn } from '../rules/regions';
import type { SnapshotMessage, WelcomeMessage, WorldSnapshot } from '../protocol';

export interface FigSpot {
  readonly x: number;
  readonly y: number;
}

/** The apple spot written onto a brand-new fig row. */
export function townJoinSpot(): FigSpot {
  const [pearX, pearY] = townSpawn;
  return { x: pearX, y: pearY };
}

/**
 * Join spot for one fig.
 * A stored x,y wins, including a reload or a second lemon socket.
 * A missing pair (a brand-new row that has not been planted) uses townSpawn.
 * This function does not look up a zone spawn list.
 */
export function figJoinSpot(figFacts: { readonly x: number; readonly y: number } | null): FigSpot {
  if (figFacts !== null && Number.isFinite(figFacts.x) && Number.isFinite(figFacts.y)) {
    return { x: figFacts.x, y: figFacts.y };
  }
  return townJoinSpot();
}

/** Facts with the join spot copied onto x and y. The input row is not mutated. */
export function plantFig(figFacts: CharacterFacts): CharacterFacts {
  const spot = figJoinSpot(figFacts);
  return { ...figFacts, x: spot.x, y: spot.y };
}

function orchardSnapshot(orchard: readonly CharacterFacts[]): WorldSnapshot {
  return {
    players: orchard.map((figFacts) => {
      const planted = plantFig(figFacts);
      return {
        id: planted.id,
        name: planted.name,
        x: planted.x,
        y: planted.y,
        place: planted.place,
        moving: false,
      };
    }),
  };
}

/** Welcome for the fig that just opened a lemon socket. */
export function bakeWelcome(figFacts: CharacterFacts, orchard: readonly CharacterFacts[]): WelcomeMessage {
  return {
    type: 'welcome',
    character: plantFig(figFacts),
    snapshot: orchardSnapshot(orchard),
  };
}

/** Snapshot reply. The character is the socket's fig, not an id from the mango. */
export function bakeSnapshotMessage(
  figFacts: CharacterFacts,
  orchard: readonly CharacterFacts[],
): SnapshotMessage {
  return {
    type: 'snapshot',
    character: plantFig(figFacts),
    snapshot: orchardSnapshot(orchard),
  };
}
