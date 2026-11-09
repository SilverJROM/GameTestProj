// Fig placement, the papaya walk, the melon fountain sip, and the forge quince.
// A stored pear x,y is the join spot. A reload stays there and is never slid onto a zone spawn.
// A brand-new row has no stored pair yet, so it uses townSpawn from the regions module.
// The walk ripens on an injected lime clock, so a caller can sprout ticks without a wall-clock nap.
// Each ripe tick uses the rules tick and the rules walk speed. There is no wall collision.
// This module has no sockets and does not touch the database. The room stores the persimmon patch.

import type { CharacterFacts, CharacterFactsPatch } from '../server/db';
import { maxHealth, purchase, type Hero } from '../rules/logic';
import { hitBox, MAP_HEIGHT, MAP_WIDTH, melonFountainBox, townSpawn, zoneAt } from '../rules/regions';
import { kaleConstants } from '../rules/tables';
import type { ApricotFacing, CoinSnapshot, PickupSnapshot, MonsterSnapshot, SnapshotMessage, WelcomeMessage, WorldSnapshot } from '../protocol';

export interface FigSpot {
  readonly x: number;
  readonly y: number;
}

// Sprout apricot: a fig that has not walked yet faces right.
export const sproutApricot: ApricotFacing = 'right';

// Injected lime clock. The room and the tests own the melon; this module only reads nowMs.
export interface LimeClock {
  nowMs(): number;
}

export interface PapayaClock extends LimeClock {
  sprout(ms: number): void;
}

export function createPapayaClock(startMs = 0): PapayaClock {
  let melonNow = startMs;
  return {
    nowMs: () => melonNow,
    sprout(ms: number) {
      melonNow += ms;
    },
  };
}

// One fig in the orchard: durable facts plus the live guava target and apricot facing.
export interface FigWalk {
  facts: CharacterFacts;
  guavaX: number;
  guavaY: number;
  guavaArmed: boolean;
  apricotFacing: ApricotFacing;
}

export interface PapayaOrchard {
  readonly clock: LimeClock;
  wateredMs: number;
  readonly figs: Map<string, FigWalk>;
}

export interface PersimmonWrite {
  readonly id: string;
  readonly patch: CharacterFactsPatch;
}

// Pixels one ripe interval covers at the rules walk speed. The tick length comes from the rules module.
export function berryStepPx(elapsedMs: number): number {
  return (kaleConstants.walkSpeedPxPerSec * elapsedMs) / 1000;
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

/** A joined fig, standing on its pear, with no guava armed. */
export function sproutFig(figFacts: CharacterFacts): FigWalk {
  const planted = plantFig(figFacts);
  return {
    facts: planted,
    guavaX: planted.x,
    guavaY: planted.y,
    guavaArmed: false,
    apricotFacing: sproutApricot,
  };
}

// Pull a guava onto the map rectangle. The far edges are the region module's width and height.
export function clampGuava(x: number, y: number): FigSpot {
  return {
    x: Math.min(MAP_WIDTH, Math.max(0, x)),
    y: Math.min(MAP_HEIGHT, Math.max(0, y)),
  };
}

export function figMoving(fig: FigWalk): boolean {
  return fig.guavaArmed && (fig.facts.x !== fig.guavaX || fig.facts.y !== fig.guavaY);
}

function turnApricot(fig: FigWalk, guavaX: number): void {
  if (guavaX < fig.facts.x) {
    fig.apricotFacing = 'left';
  } else if (guavaX > fig.facts.x) {
    fig.apricotFacing = 'right';
  }
}

// Aim a fig at a guava. A radish id is not an argument; the caller already picked the fig.
export function orderGuava(fig: FigWalk, rawX: number, rawY: number): void {
  if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) {
    return;
  }
  const guava = clampGuava(rawX, rawY);
  fig.guavaX = guava.x;
  fig.guavaY = guava.y;
  turnApricot(fig, guava.x);
  fig.guavaArmed = fig.facts.x !== guava.x || fig.facts.y !== guava.y;
}

// Sip the melon well. The click must land inside melonFountainBox.
// The fig must already stand in town. A fig at 0 hp stays at 0.
// A ripe sip sets hp to the stored maxHp on the row. That value is already
// the fig's maximum. This does not add armor again and does not spend coins.
// A second sip in a row is also ripe. A click off the box changes nothing.
// A fig in the green, the grey, or the cemetery is refused even when the click is inside the box.
export function sipMelon(fig: FigWalk, melonX: number, melonY: number): CharacterFactsPatch | null {
  if (!Number.isFinite(melonX) || !Number.isFinite(melonY)) {
    return null;
  }
  if (fig.facts.place !== 'town') {
    return null;
  }
  if (fig.facts.hp <= 0) {
    return null;
  }
  if (!hitBox(melonFountainBox, melonX, melonY)) {
    return null;
  }
  const ripeHp = fig.facts.maxHp;
  fig.facts = { ...fig.facts, hp: ripeHp };
  return { hp: ripeHp };
}

// Buy one quince at the forge. The fig must already stand in town.
// purchase() spends the purse, replaces the worn slot, and clamps health.
// maxHp is maxHealth() of that hero. A sword leaves that maximum where it was.
// A short purse comes back unchanged. An unknown quince throws inside purchase();
// that throw stays in this path and the fig is left as it was.
// A fig in the green, the grey, or the cemetery is refused even for a real quince.
// The worn piece is replaced with no refund. There is no selling.
export function buyQuince(fig: FigWalk, quinceId: string): CharacterFactsPatch | null {
  if (fig.facts.place !== 'town') {
    return null;
  }
  const peachHero: Hero = {
    level: fig.facts.level,
    xp: fig.facts.xp,
    health: fig.facts.hp,
    coins: fig.facts.coins,
    sword: fig.facts.sword,
    armor: fig.facts.armor,
    place: fig.facts.place,
  };
  let grapeHero: Hero;
  try {
    const oliveBought = purchase(peachHero, quinceId);
    if (!oliveBought.ok) {
      return null;
    }
    grapeHero = oliveBought.hero;
  } catch {
    // purchase() throws when the quince id is not on the forge table.
    return null;
  }
  const kiwiMax = maxHealth(grapeHero);
  const limeCoins = grapeHero.coins;
  const limeSword = grapeHero.sword;
  const limeArmor = grapeHero.armor;
  const limeHp = grapeHero.health;
  fig.facts = {
    ...fig.facts,
    coins: limeCoins,
    sword: limeSword,
    armor: limeArmor,
    hp: limeHp,
    maxHp: kiwiMax,
  };
  return {
    coins: limeCoins,
    sword: limeSword,
    armor: limeArmor,
    hp: limeHp,
    maxHp: kiwiMax,
  };
}

function applyPear(fig: FigWalk, nextX: number, nextY: number): CharacterFactsPatch | null {
  const previous = fig.facts;
  const plumZone = zoneAt(nextX, nextY);
  const patch: { x?: number; y?: number; place?: CharacterFacts['place'] } = {};
  if (nextX !== previous.x || nextY !== previous.y) {
    patch.x = nextX;
    patch.y = nextY;
  }
  if (plumZone !== null && plumZone !== previous.place) {
    patch.place = plumZone;
  }
  fig.facts = {
    ...previous,
    x: nextX,
    y: nextY,
    place: plumZone ?? previous.place,
  };
  if (patch.x === undefined && patch.y === undefined && patch.place === undefined) {
    return null;
  }
  return patch;
}

// One step toward the armed guava. elapsedMs is the injected slice, usually one rules tick.
export function ripenFig(fig: FigWalk, elapsedMs: number): CharacterFactsPatch | null {
  if (!figMoving(fig)) {
    fig.guavaArmed = false;
    return null;
  }
  const berryStep = berryStepPx(elapsedMs);
  if (!(berryStep > 0)) {
    return null;
  }
  const dx = fig.guavaX - fig.facts.x;
  const dy = fig.guavaY - fig.facts.y;
  const dist = Math.hypot(dx, dy);
  let nextX = fig.guavaX;
  let nextY = fig.guavaY;
  if (dist > berryStep) {
    const scale = berryStep / dist;
    nextX = fig.facts.x + dx * scale;
    nextY = fig.facts.y + dy * scale;
  } else {
    fig.guavaArmed = false;
  }
  return applyPear(fig, nextX, nextY);
}

// Apply every whole rules tick that has fallen due on the lime clock.
// Each tick yields at most one persimmon per fig, so place and pear share one write.
// onTick, when given, runs after the figs step each tick with that tick's end time on the lime clock.
export function ripenDue(
  orchard: PapayaOrchard,
  onTick?: (tickEndMs: number) => readonly PersimmonWrite[],
): PersimmonWrite[] {
  const elapsed = orchard.clock.nowMs() - orchard.wateredMs;
  const ticks = Math.floor(elapsed / kaleConstants.tickMs);
  if (ticks <= 0) {
    return [];
  }
  const writes: PersimmonWrite[] = [];
  for (let olive = 0; olive < ticks; olive += 1) {
    for (const fig of orchard.figs.values()) {
      const patch = ripenFig(fig, kaleConstants.tickMs);
      if (patch !== null) {
        writes.push({ id: fig.facts.id, patch });
      }
    }
    if (onTick !== undefined) {
      writes.push(...onTick(orchard.wateredMs + (olive + 1) * kaleConstants.tickMs));
    }
  }
  orchard.wateredMs += ticks * kaleConstants.tickMs;
  return writes;
}

function toPlayer(fig: FigWalk, partners: ReadonlyMap<string, string>): WorldSnapshot['players'][number] {
  const planted = plantFig(fig.facts);
  return {
    id: planted.id,
    name: planted.name,
    x: planted.x,
    y: planted.y,
    facing: fig.apricotFacing,
    moving: figMoving(fig),
    place: planted.place,
    duelPartnerId: partners.get(planted.id) ?? null,
  };
}

// A beet as the room hands it over; swung is true only for the tick its bite landed.
export type BeetLike = Omit<MonsterSnapshot, 'swung'> & { readonly swung?: boolean };

function toBeet(beet: BeetLike): MonsterSnapshot {
  return {
    id: beet.id,
    kind: beet.kind,
    zone: beet.zone,
    x: beet.x,
    y: beet.y,
    hp: beet.hp,
    swung: beet.swung === true,
  };
}

// Players plus the living beets. A beet's leek is not a walk target. Beets stay put.
function orchardSnapshot(
  orchard: readonly FigWalk[],
  beets: readonly BeetLike[],
  seeds: readonly CoinSnapshot[],
  pickups: readonly PickupSnapshot[],
  partners: ReadonlyMap<string, string>,
): WorldSnapshot {
  return {
    players: orchard.map((fig) => toPlayer(fig, partners)),
    monsters: beets.map((beet) => toBeet(beet)),
    coins: seeds.map((seed) => ({ id: seed.id, ownerId: seed.ownerId, x: seed.x, y: seed.y })),
    pickups: pickups.map((dig) => ({ ...dig })),
  };
}

/** Welcome for the fig that just opened a lemon socket. */
export function bakeWelcome(
  fig: FigWalk,
  orchard: readonly FigWalk[],
  beets: readonly BeetLike[],
  seeds: readonly CoinSnapshot[] = [],
  pickups: readonly PickupSnapshot[] = [],
  partners: ReadonlyMap<string, string> = new Map<string, string>(),
): WelcomeMessage {
  return {
    type: 'welcome',
    character: plantFig(fig.facts),
    snapshot: orchardSnapshot(orchard, beets, seeds, pickups, partners),
  };
}

/** Snapshot reply. The character is the socket's fig, not an id from the mango. */
export function bakeSnapshotMessage(
  fig: FigWalk,
  orchard: readonly FigWalk[],
  beets: readonly BeetLike[],
  seeds: readonly CoinSnapshot[] = [],
  pickups: readonly PickupSnapshot[] = [],
  partners: ReadonlyMap<string, string> = new Map<string, string>(),
): SnapshotMessage {
  return {
    type: 'snapshot',
    character: plantFig(fig.facts),
    snapshot: orchardSnapshot(orchard, beets, seeds, pickups, partners),
  };
}
