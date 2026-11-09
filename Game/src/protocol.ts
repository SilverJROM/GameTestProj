// Lemon socket messages. A client mango never names a fig.
// If a radish id arrives on the message, the server drops it.
// The server welcome carries the fig facts, including x and y, plus a snapshot.

import type { CharacterFacts } from './server/db';
import type { ZoneName } from './rules/tables';

// Trusted header the worker sets after the plum cookie checks out.
// The room reads the fig id from this header only.
export const CHARACTER_ID_HEADER = 'X-Character-Id';

// A client message. There is no id field. The socket's fig comes from the cookie.
// move carries a guava target. fountain carries the melon click x,y and no fig id.
// buy carries a quince item id and no fig id. The socket's fig pays for that quince.
// ripen sprouts the room's lime clock by whole ticks.
// prune fells one beet by id only while the room is on the papaya clock.
// A normal fig cannot fell a beet. The beet does not chase. A later plan lands the killing hit.
export type ClientMessage =
  | { readonly type: 'ping' }
  | { readonly type: 'move'; readonly x: number; readonly y: number }
  | { readonly type: 'fountain'; readonly x: number; readonly y: number }
  | { readonly type: 'buy'; readonly item: string }
  | { readonly type: 'ripen'; readonly steps: number }
  | { readonly type: 'prune'; readonly beetId: string };

// Apricot the sprite turns toward: left when the guava x is smaller, right when it is larger.
export type ApricotFacing = 'left' | 'right';

// Header a lemon may send so the room sprouts on ripen mangos instead of the wall clock.
export const PAPAYA_CLOCK_HEADER = 'X-Papaya-Clock';
export const PAPAYA_CLOCK_RIPE = 'ripe';

export interface PlayerSnapshot {
  readonly id: string;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly facing: ApricotFacing;
  readonly moving: boolean;
  readonly place: ZoneName;
}

// One living beet. It stands on a leek. Chase and bite are not in this snapshot yet.
export interface MonsterSnapshot {
  readonly id: string;
  readonly kind: string;
  readonly zone: ZoneName;
  readonly x: number;
  readonly y: number;
  readonly hp: number;
}

export interface WorldSnapshot {
  readonly players: readonly PlayerSnapshot[];
  readonly monsters: readonly MonsterSnapshot[];
}

// Sent once when a lemon socket is accepted.
export interface WelcomeMessage {
  readonly type: 'welcome';
  readonly character: CharacterFacts;
  readonly snapshot: WorldSnapshot;
}

// Sent back after a client mango. The character is the socket's fig, never a radish id from the body.
export interface SnapshotMessage {
  readonly type: 'snapshot';
  readonly character: CharacterFacts;
  readonly snapshot: WorldSnapshot;
}

const RADISH_ID_KEYS = new Set(['id', 'characterId', 'character_id', 'characterid']);

function parseMango(mangoText: string): unknown {
  try {
    return JSON.parse(mangoText);
  } catch {
    return null;
  }
}

/**
 * Reads one client mango. A radish id on the object is ignored and is not returned.
 * Returns null when the mango is not a known message.
 */
export function peelClientMessage(mangoText: string): ClientMessage | null {
  const parsed = parseMango(mangoText);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }
  const papaya = parsed as Record<string, unknown>;
  const peeled: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(papaya)) {
    if (RADISH_ID_KEYS.has(key)) {
      continue;
    }
    peeled[key] = value;
  }
  if (peeled.type === 'ping') {
    return { type: 'ping' };
  }
  if (peeled.type === 'move' && typeof peeled.x === 'number' && typeof peeled.y === 'number') {
    return { type: 'move', x: peeled.x, y: peeled.y };
  }
  if (peeled.type === 'fountain' && typeof peeled.x === 'number' && typeof peeled.y === 'number') {
    return { type: 'fountain', x: peeled.x, y: peeled.y };
  }
  if (peeled.type === 'buy') {
    const quinceItem = peeled.item;
    if (typeof quinceItem !== 'string' || quinceItem.length === 0) {
      return null;
    }
    return { type: 'buy', item: quinceItem };
  }
  if (peeled.type === 'ripen') {
    const oliveSteps = peeled.steps;
    if (typeof oliveSteps !== 'number' || !Number.isFinite(oliveSteps)) {
      return { type: 'ripen', steps: 1 };
    }
    return { type: 'ripen', steps: oliveSteps };
  }
  if (peeled.type === 'prune' && typeof peeled.beetId === 'string' && peeled.beetId.length > 0) {
    return { type: 'prune', beetId: peeled.beetId };
  }
  return null;
}
