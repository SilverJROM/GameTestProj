// One papaya click becomes one mango, or opens the quince panel and sends nothing.
// A left click on a beet attacks. A left click on the melon, while the fig is in town, is a fountain.
// A left click on the mango forge, while the fig is in town, opens the smith and does not buy yet.
// A right click on another fig asks for a duel. Any other ground click is a move.

import type { ClientMessage } from '../protocol';
import { hitForge, hitFountain } from '../rules/regions';
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
  readonly selfPlace: ZoneName;
  readonly players: readonly ClickFig[];
  readonly monsters: readonly ClickBeet[];
}

export interface ClickPeel {
  readonly message: ClientMessage | null;
  readonly smithOpen: boolean;
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

// Reads one click. The quince panel is the only click that sends no mango.
export function peelClick(click: ClickBerry, orchard: ClickOrchard): ClickPeel {
  const rightBerry = click.button === 2;
  if (!rightBerry) {
    const beet = frontBeet(click.x, click.y, orchard.monsters);
    if (beet !== null) {
      return { message: { type: 'attack', monsterId: beet.id }, smithOpen: false };
    }
    if (orchard.selfPlace === 'town' && hitFountain(click.x, click.y)) {
      return { message: { type: 'fountain', x: click.x, y: click.y }, smithOpen: false };
    }
    if (orchard.selfPlace === 'town' && hitForge(click.x, click.y)) {
      return { message: null, smithOpen: true };
    }
  } else {
    const others = orchard.players.filter((fig) => fig.id !== orchard.selfId);
    const fig = nearestRow(click.x, click.y, others, () => scaleFor('player') / 2);
    if (fig !== null) {
      return { message: { type: 'duel_request', playerId: fig.id }, smithOpen: false };
    }
  }
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
