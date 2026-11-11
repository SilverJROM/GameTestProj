// Lemon socket messages. A client mango never names a fig.
// If a radish id arrives on the message, the server drops it.
// The server welcome carries the fig facts, including x and y, plus a snapshot.

import type { CharacterFacts } from './server/db';
import type { ZoneName } from './rules/tables';

// Trusted header the worker sets after the plum cookie checks out.
// The room reads the fig id from this header only.
export const CHARACTER_ID_HEADER = 'X-Character-Id';

// Internal orchard path. The worker calls it after an ownership check, with the fig id
// on CHARACTER_ID_HEADER. A client request is never forwarded to this path.
export const DROP_FIG_PATH = '/internal/drop-fig';

// A client message. There is no id field. The socket's fig comes from the cookie.
// move carries a guava target. fountain carries the melon click x,y and no fig id.
// buy carries a quince item id and no fig id. The socket's fig pays and the quince goes in the bag.
// equip carries an owned quince id. unequip carries the sword or armor slot. Neither names a fig.
// ripen sprouts the room's lime clock by whole ticks.
// prune fells one beet by id only while the room is on the papaya clock.
// attack carries a beet id only. The socket's fig swings; a radish id on it is dropped.
// A normal fig cannot fell a beet with prune. An attack in reach lands the killing hit.
// A hit beet chases its first hitter and bites; the snapshot flags each landed bite.
export type ClientMessage =
  | { readonly type: 'ping' }
  | { readonly type: 'move'; readonly x: number; readonly y: number }
  | { readonly type: 'fountain'; readonly x: number; readonly y: number }
  | { readonly type: 'buy'; readonly item: string }
  | { readonly type: 'equip'; readonly itemId: string; readonly slot?: 'sword' | 'armor' }
  | { readonly type: 'unequip'; readonly slot: 'sword' | 'armor' }
  | { readonly type: 'ripen'; readonly steps: number }
  | { readonly type: 'prune'; readonly beetId: string }
  // once: one swing only, no walking to the monster and no following fights (the page never sends it; tests use it).
  | { readonly type: 'attack'; readonly monsterId: string; readonly once?: true }
  | { readonly type: 'attack'; readonly playerId: string }
  | { readonly type: 'duel_request'; readonly playerId: string }
  | { readonly type: 'duel_accept'; readonly playerId: string }
  | { readonly type: 'duel_decline'; readonly playerId: string };

// duel_request names the target. duel_accept and duel_decline name the fig who asked.
// The asker or answerer is always the socket's fig, never an id on the message.

// Apricot the sprite turns toward: left when the guava x is smaller, right when it is larger.
export type ApricotFacing = 'left' | 'right';

// Header a lemon may send so the room sprouts on ripen mangos instead of the wall clock.
export const PAPAYA_CLOCK_HEADER = 'X-Papaya-Clock';
export const PAPAYA_CLOCK_RIPE = 'ripe';

export type FigGender = 'woman' | 'man';

export interface PlayerSnapshot {
  readonly id: string;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly facing: ApricotFacing;
  readonly moving: boolean;
  readonly place: ZoneName;
  // Woman or man, so each fig draws the matching stills.
  readonly gender: FigGender;
  // The fig this player is dueling, or null. Set on exactly the two paired players (red glow).
  readonly duelPartnerId: string | null;
  // True only for the snapshot in which this player's swing landed (the avatar shows its swing frames).
  readonly attacking?: boolean;
}

// One living beet. It stands on a leek until hit, then chases.
export interface MonsterSnapshot {
  readonly id: string;
  readonly kind: string;
  readonly zone: ZoneName;
  readonly x: number;
  readonly y: number;
  readonly hp: number;
  // True while this beet is on a fig. A wolf or a bear gets there from a hit.
  // A skeleton gets there with no hit when a fig is within the cemetery wake radius.
  // A fig standing in town does not set it.
  readonly aggro: boolean;
  // True for the tick this beet's bite landed, so a client can pick the bite or swipe still.
  readonly swung: boolean;
}

// One coin seed on the ground, owned by the character who felled the monster.
// value is the whole purse credit. The client draws one icon, not one per point.
export interface CoinSnapshot {
  readonly id: string;
  readonly ownerId: string;
  readonly x: number;
  readonly y: number;
  readonly value: number;
}

// One damage number for the tick it landed. The client floats it once and then drops it.
export interface HitMark {
  readonly id: string;
  readonly targetKind: 'monster' | 'player';
  readonly targetId: string;
  readonly amount: number;
  readonly x: number;
  readonly y: number;
  // True when this hit killed a player at (x, y).
  readonly fatal?: boolean;
}

// A pickup in progress: the owner's coin spot and how much of the dig has passed.
export interface PickupSnapshot {
  readonly ownerId: string;
  readonly coinId: string;
  readonly x: number;
  readonly y: number;
  readonly elapsedSeconds: number;
}

export interface WorldSnapshot {
  readonly players: readonly PlayerSnapshot[];
  readonly monsters: readonly MonsterSnapshot[];
  readonly coins: readonly CoinSnapshot[];
  // One row per owner whose pet is digging right now; empty when no dig runs.
  readonly pickups: readonly PickupSnapshot[];
  // Hits that landed on this tick. Welcome sends an empty list.
  readonly hits?: readonly HitMark[];
}

// Sent once when a lemon socket is accepted.
export interface WelcomeMessage {
  readonly type: 'welcome';
  readonly character: CharacterFacts;
  readonly snapshot: WorldSnapshot;
}

// Sent only to the target of a valid duel_request.
export interface DuelOfferMessage {
  readonly type: 'duel_offer';
  readonly fromId: string;
  readonly fromName: string;
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
  if (peeled.type === 'equip') {
    const quinceId = peeled.itemId;
    if (typeof quinceId !== 'string' || quinceId.length === 0) {
      return null;
    }
    const quinceSlot = peeled.slot;
    if (quinceSlot !== undefined && quinceSlot !== 'sword' && quinceSlot !== 'armor') {
      return null;
    }
    if (quinceSlot === 'sword' || quinceSlot === 'armor') {
      return { type: 'equip', itemId: quinceId, slot: quinceSlot };
    }
    return { type: 'equip', itemId: quinceId };
  }
  if (peeled.type === 'unequip') {
    const quinceSlot = peeled.slot;
    if (quinceSlot !== 'sword' && quinceSlot !== 'armor') {
      return null;
    }
    return { type: 'unequip', slot: quinceSlot };
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
  if (peeled.type === 'attack' && typeof peeled.monsterId === 'string' && peeled.monsterId.length > 0) {
    // A message that names a monster is a monster attack; a playerId beside it is dropped.
    return peeled.once === true ? { type: 'attack', monsterId: peeled.monsterId, once: true } : { type: 'attack', monsterId: peeled.monsterId };
  }
  if (peeled.type === 'attack' && typeof peeled.playerId === 'string' && peeled.playerId.length > 0) {
    return { type: 'attack', playerId: peeled.playerId };
  }
  if (
    (peeled.type === 'duel_request' || peeled.type === 'duel_accept' || peeled.type === 'duel_decline') &&
    typeof peeled.playerId === 'string' &&
    peeled.playerId.length > 0
  ) {
    return { type: peeled.type, playerId: peeled.playerId };
  }
  return null;
}
