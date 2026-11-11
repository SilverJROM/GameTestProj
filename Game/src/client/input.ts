// One papaya click becomes one mango, or opens a panel and sends nothing.
// Left click: on a monster, or on the duel partner once the duel has started, walk to it and swing once; on the fountain
// (in town) only walk (the fountain heals by regeneration, plan 14); on the forge (in town) open the smith; anywhere else, including on a player who is not the partner, only walk.
// Right click: on a monster, walk to it and keep swinging until it dies; on the duel partner, walk to them and keep
// swinging until one falls; on any other player, open the duel menu (nothing is sent until the player picks Duel);
// on the ground, nothing.

import type { ClientMessage } from '../protocol';
import { hitForge } from '../rules/regions';
import type { ZoneName } from '../rules/tables';
import { scaleFor } from './sprites';
import { beetSpriteRect, melonHolds } from './view';

export interface ClickBerry {
  readonly x: number;
  readonly y: number;
  readonly button: number;
}

export interface ClickFig {
  readonly id: string;
  readonly x: number;
  readonly y: number;
}

export interface ClickBeet {
  readonly id: string;
  readonly kind: string;
  readonly x: number;
  readonly y: number;
  // The picture the painter is showing. Omit it and the stand still is the click box.
  readonly src?: string;
}

export interface ClickOrchard {
  readonly selfId: string;
  // The avatar this player is in a duel with (after both agreed), or null/undefined.
  readonly duelPartnerId?: string | null;
  readonly selfPlace: ZoneName;
  readonly players: readonly ClickFig[];
  readonly monsters: readonly ClickBeet[];
}

export interface ClickPeel {
  readonly message: ClientMessage | null;
  readonly smithOpen: boolean;
  // A right click landed on this other player: the page opens its little duel menu for them.
  readonly duelMenu?: { readonly playerId: string };
}

// The click box of another player: the whole drawn body, from a little under the feet to above the head.
export function figSpriteHolds(fig: { readonly x: number; readonly y: number }, x: number, y: number): boolean {
  const height = scaleFor('player');
  const halfWidth = Math.ceil(height * 0.36);
  const pad = 6;
  return x >= fig.x - halfWidth - pad && x <= fig.x + halfWidth + pad && y >= fig.y - height - pad && y <= fig.y + pad + 8;
}

// The other player under the pointer, the one in front (lowest feet) when two overlap.
export function frontFig(x: number, y: number, rows: readonly ClickFig[]): ClickFig | null {
  let best: ClickFig | null = null;
  for (const row of rows) {
    if (!figSpriteHolds(row, x, y)) continue;
    if (best === null || row.y > best.y) best = row;
  }
  return best;
}

function nearestRow<T extends { readonly x: number; readonly y: number }>(
  x: number,
  y: number,
  rows: readonly T[],
  radiusOf: (row: T) => number,
): T | null {
  let best: T | null = null;
  let bestDist = Infinity;
  for (const row of rows) {
    const radius = radiusOf(row);
    const dx = x - row.x;
    const dy = y - row.y;
    const dist = dx * dx + dy * dy;
    if (dist <= radius * radius && dist < bestDist) {
      best = row;
      bestDist = dist;
    }
  }
  return best;
}

// The beet in front: lowest feet on the screen, then the nearest picture centre.
export function frontBeet(x: number, y: number, rows: readonly ClickBeet[]): ClickBeet | null {
  let best: ClickBeet | null = null;
  let bestFeet = -Infinity;
  let bestDist = Infinity;
  for (const row of rows) {
    const melon = beetSpriteRect(row.x, row.y, row.kind, row.src);
    if (!melonHolds(melon, x, y)) continue;
    const cx = melon.x + melon.width / 2;
    const cy = melon.y + melon.height / 2;
    const dx = x - cx;
    const dy = y - cy;
    const dist = dx * dx + dy * dy;
    if (row.y > bestFeet || (row.y === bestFeet && dist < bestDist)) {
      best = row;
      bestFeet = row.y;
      bestDist = dist;
    }
  }
  return best;
}

// Reads one click. The quince panel and the duel menu are the clicks that send no mango.
export function peelClick(click: ClickBerry, orchard: ClickOrchard): ClickPeel {
  const rightBerry = click.button === 2;
  const others = orchard.players.filter((fig) => fig.id !== orchard.selfId);
  if (rightBerry) {
    const beet = frontBeet(click.x, click.y, orchard.monsters);
    if (beet !== null) {
      // Walk to the monster and keep swinging until it dies (or the player clicks the ground).
      return { message: { type: 'attack', monsterId: beet.id }, smithOpen: false };
    }
    const fig = frontFig(click.x, click.y, others);
    if (fig !== null) {
      if (orchard.duelPartnerId === fig.id) {
        // The duel partner: walk to them and keep swinging until one falls.
        return { message: { type: 'attack', playerId: fig.id, walk: true }, smithOpen: false };
      }
      return { message: null, smithOpen: false, duelMenu: { playerId: fig.id } };
    }
    return { message: null, smithOpen: false };
  }
  const beet = frontBeet(click.x, click.y, orchard.monsters);
  if (beet !== null) {
    // Walk to the monster and swing once.
    return { message: { type: 'attack', monsterId: beet.id, once: true, walk: true }, smithOpen: false };
  }
  if (orchard.selfPlace === 'town' && hitForge(click.x, click.y)) {
    return { message: null, smithOpen: true };
  }
  // The duel partner is fought like a monster: a left click walks over and swings once.
  const partner = orchard.duelPartnerId == null ? null : frontFig(click.x, click.y, others.filter((fig) => fig.id === orchard.duelPartnerId));
  if (partner !== null) {
    return { message: { type: 'attack', playerId: partner.id, once: true, walk: true }, smithOpen: false };
  }
  // Everything else, another player included, only walks: a fight with a player starts from a right click and a duel.
  return { message: { type: 'move', x: click.x, y: click.y }, smithOpen: false };
}

// A quince chosen in the open smith panel. This is the buy, not the forge click.
export function buyQuince(itemId: string): ClientMessage {
  return { type: 'buy', item: itemId };
}

// Wear a quince that is already in the bag. The slot is the quince's own slot.
export function equipQuince(itemId: string): ClientMessage {
  return { type: 'equip', itemId };
}

// Stow the worn quince in one slot back into the bag.
export function unequipQuince(slot: 'sword' | 'armor'): ClientMessage {
  return { type: 'unequip', slot };
}

// Accept and decline name the fig who asked.
export function answerPlum(kind: 'accept' | 'decline', askerId: string): ClientMessage {
  if (kind === 'accept') {
    return { type: 'duel_accept', playerId: askerId };
  }
  return { type: 'duel_decline', playerId: askerId };
}
