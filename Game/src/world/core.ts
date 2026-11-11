// Fig placement, the papaya walk, the melon fountain sip, and the forge quince.
// A stored pear x,y is the join spot. A reload stays there and is never slid onto a zone spawn.
// A brand-new row has no stored pair yet, so it uses townSpawn from the regions module.
// The walk ripens on an injected lime clock, so a caller can sprout ticks without a wall-clock nap.
// Each ripe tick uses the rules tick and the rules walk speed.
// A solid wall slides a diagonal step and stops a head-on one. An open gate is a lime hop.
// This module has no sockets and does not touch the database. The room stores the persimmon patch.

import type { CharacterFacts, CharacterFactsPatch } from '../server/db';
import { buyItem, equipItem, unequipItem, type OwnedGear } from '../rules/items';
import { duelMaxHealth, maxHealth, type Hero } from '../rules/logic';
import { firstSolidWallCrossing, firstSolidWallHit, hitBox, MAP_HEIGHT, MAP_WIDTH, melonFountainBox, nearFountain, skeletonRadiusPx, townSpawn, zoneAt, type GuavaWallHit } from '../rules/regions';
import { planWalk } from '../rules/route';
import { petFor } from '../rules/pets';
import { FOUNTAIN_REGEN_HP_PER_SEC, FOUNTAIN_REGEN_REACH_PX, kaleConstants, onionMonsterRows, type GearSlot } from '../rules/tables';
import type { ApricotFacing, CoinSnapshot, HitMark, PickupSnapshot, MonsterSnapshot, SnapshotMessage, WelcomeMessage, WorldSnapshot } from '../protocol';

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
  // Gate hops before the guava. A new move clears this queue.
  limeStops: FigSpot[];
  // The area share this player's camera shows (reported by the client). Unset means the widest, until the client says.
  viewZoom?: number;
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
  return { ...figFacts, items: figFacts.items ?? [], x: spot.x, y: spot.y };
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
    limeStops: [],
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
  if (!fig.guavaArmed) return false;
  if (fig.limeStops.length > 0) return true;
  return fig.facts.x !== fig.guavaX || fig.facts.y !== fig.guavaY;
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
  // A dead avatar lies where it fell: it cannot walk until it respawns.
  if (fig.facts.hp <= 0) {
    return;
  }
  const clicked = clampGuava(rawX, rawY);
  fig.limeStops = [];
  // The best way there: straight when clear, otherwise around the walls through the gate. A click on a wall goes to
  // the nearest spot beside it; a spot with no way to it leaves the avatar where it is.
  const plan = planWalk([fig.facts.x, fig.facts.y], [clicked.x, clicked.y]);
  if (plan === null) {
    fig.guavaX = fig.facts.x;
    fig.guavaY = fig.facts.y;
    fig.guavaArmed = false;
    return;
  }
  const guava = { x: plan.target[0], y: plan.target[1] };
  fig.guavaX = guava.x;
  fig.guavaY = guava.y;
  for (const bend of plan.bends) {
    fig.limeStops.push({ x: bend[0], y: bend[1] });
  }
  turnApricot(fig, fig.limeStops[0]?.x ?? guava.x);
  fig.guavaArmed = fig.limeStops.length > 0 || fig.facts.x !== guava.x || fig.facts.y !== guava.y;
}

// Fountain regeneration: a living fig in town, in or near the fountain, gains FOUNTAIN_REGEN_HP_PER_SEC per second up to
// its maximum. `carry` keeps the fraction between ticks so 5 per second is exact over time. Returns true when health rose.
export function regenAtFountain(fig: FigWalk, dtMs: number, carry: Map<string, number>): boolean {
  const id = fig.facts.id;
  if (fig.facts.place !== 'town' || fig.facts.hp <= 0 || fig.facts.hp >= fig.facts.maxHp || !nearFountain(fig.facts.x, fig.facts.y, FOUNTAIN_REGEN_REACH_PX)) {
    carry.delete(id);
    return false;
  }
  const owed = (carry.get(id) ?? 0) + (FOUNTAIN_REGEN_HP_PER_SEC * dtMs) / 1000;
  const whole = Math.floor(owed + 1e-9);
  carry.set(id, owed - whole);
  if (whole < 1) return false;
  const hp = Math.min(fig.facts.maxHp, fig.facts.hp + whole);
  fig.facts = { ...fig.facts, hp };
  if (hp >= fig.facts.maxHp) carry.delete(id);
  return true;
}

function ownedGear(fig: FigWalk): OwnedGear {
  return {
    level: fig.facts.level,
    health: fig.facts.hp,
    coins: fig.facts.coins,
    sword: fig.facts.sword,
    armor: fig.facts.armor,
    items: fig.facts.items ?? [],
    elsewhere: (fig.facts.elsewhere ?? []).map((row) => row.itemId),
  };
}

// Copy a bag change onto the fig. The patch is the worn slot plus hp and maxHp.
function applyWorn(fig: FigWalk, gear: OwnedGear): CharacterFactsPatch {
  const hero: Hero = {
    level: gear.level,
    xp: fig.facts.xp,
    health: gear.health,
    coins: gear.coins,
    sword: gear.sword,
    armor: gear.armor,
    place: fig.facts.place,
  };
  const kiwiMax = maxHealth(hero);
  const patch: CharacterFactsPatch = {
    hp: gear.health,
    maxHp: kiwiMax,
    ...(gear.sword !== fig.facts.sword ? { sword: gear.sword } : {}),
    ...(gear.armor !== fig.facts.armor ? { armor: gear.armor } : {}),
  };
  fig.facts = {
    ...fig.facts,
    coins: gear.coins,
    sword: gear.sword,
    armor: gear.armor,
    hp: gear.health,
    maxHp: kiwiMax,
    items: [...gear.items],
  };
  return patch;
}

// Buy one quince at the forge. The fig must already stand in town.
// The purse pays and the quince lands in the bag. Nothing is equipped.
// A short purse, an owned quince, or an unknown quince comes back unchanged.
// A fig in the green, the grey, or the cemetery is refused even for a real quince.
export function buyQuince(fig: FigWalk, quinceId: string): CharacterFactsPatch | null {
  if (fig.facts.place !== 'town') {
    return null;
  }
  const bought = buyItem(ownedGear(fig), quinceId);
  if (!bought.ok) {
    return null;
  }
  fig.facts = {
    ...fig.facts,
    coins: bought.gear.coins,
    items: [...bought.gear.items],
  };
  return { coins: bought.gear.coins };
}

// Wear an owned quince. Allowed in every zone. A mismatched slot is refused.
// The patch names the slot that changed, plus hp and maxHp.
export function wearQuince(fig: FigWalk, quinceId: string, slot?: GearSlot): CharacterFactsPatch | null {
  const worn = equipItem(ownedGear(fig), quinceId, slot);
  if (!worn.ok) {
    return null;
  }
  return applyWorn(fig, worn.gear);
}

// Return the worn quince in one slot to the bag. Allowed in every zone.
export function stashQuince(fig: FigWalk, slot: GearSlot): CharacterFactsPatch | null {
  const stashed = unequipItem(ownedGear(fig), slot);
  if (!stashed.ok) {
    return null;
  }
  return applyWorn(fig, stashed.gear);
}

const WALL_STOP_GAP_PX = 0.5;
// A tangential leftover under this, on one tick, is a head-on stop.
const PEACH_SLIDE_MIN_PX = 2;

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

function pearStopPoint(fromX: number, fromY: number, hit: GuavaWallHit): FigSpot {
  const hitDx = hit.point[0] - fromX;
  const hitDy = hit.point[1] - fromY;
  const hitDist = Math.hypot(hitDx, hitDy);
  const back = Math.min(WALL_STOP_GAP_PX, hitDist);
  const keep = hitDist > 0 ? (hitDist - back) / hitDist : 0;
  return { x: fromX + hitDx * keep, y: fromY + hitDy * keep };
}

// Leftover past the wall, projected onto the wall, with the stop gap kept.
// Null: the projection is a head-on tap, or the slide would cross a solid wall
// or leave the picture. The caller then stops as before.
function peachSlide(fromX: number, fromY: number, nextX: number, nextY: number, hit: GuavaWallHit): FigSpot | null {
  const wallDx = hit.wallB[0] - hit.wallA[0];
  const wallDy = hit.wallB[1] - hit.wallA[1];
  const wallLen = Math.hypot(wallDx, wallDy);
  if (!(wallLen > 0)) return null;
  const ux = wallDx / wallLen;
  const uy = wallDy / wallLen;
  const proj = (nextX - hit.point[0]) * ux + (nextY - hit.point[1]) * uy;
  if (Math.abs(proj) < PEACH_SLIDE_MIN_PX) return null;
  const stopped = pearStopPoint(fromX, fromY, hit);
  const slideX = stopped.x + ux * proj;
  const slideY = stopped.y + uy * proj;
  if (zoneAt(slideX, slideY) === null) return null;
  if (firstSolidWallCrossing([fromX, fromY], [slideX, slideY]) !== null) return null;
  return { x: slideX, y: slideY };
}

function ripeHop(fig: FigWalk): FigSpot {
  const lime = fig.limeStops[0];
  if (lime !== undefined) return lime;
  return { x: fig.guavaX, y: fig.guavaY };
}

// One step toward the armed guava, or toward the lime hop in front of it.
// elapsedMs is the injected slice, usually one rules tick.
export function ripenFig(fig: FigWalk, elapsedMs: number): CharacterFactsPatch | null {
  if (!figMoving(fig)) {
    fig.guavaArmed = false;
    return null;
  }
  let budget = berryStepPx(elapsedMs);
  if (!(budget > 0)) {
    return null;
  }
  let cursorX = fig.facts.x;
  let cursorY = fig.facts.y;
  // A tick may finish a lime hop and still have step left for the guava.
  for (let plum = 0; plum < 4 && fig.guavaArmed && budget > 1e-9; plum += 1) {
    const hop = ripeHop(fig);
    const dx = hop.x - cursorX;
    const dy = hop.y - cursorY;
    const dist = Math.hypot(dx, dy);
    if (dist <= 1e-9) {
      if (fig.limeStops.length > 0) {
        fig.limeStops.shift();
        turnApricot(fig, ripeHop(fig).x);
        continue;
      }
      fig.guavaArmed = false;
      break;
    }
    const step = Math.min(budget, dist);
    const scale = step / dist;
    const nextX = cursorX + dx * scale;
    const nextY = cursorY + dy * scale;
    const arriving = dist <= budget;
    const hit = firstSolidWallHit([cursorX, cursorY], [nextX, nextY]);
    if (hit !== null) {
      const slid = peachSlide(cursorX, cursorY, nextX, nextY, hit);
      if (slid !== null) {
        cursorX = slid.x;
        cursorY = slid.y;
      } else {
        const stopped = pearStopPoint(cursorX, cursorY, hit);
        cursorX = stopped.x;
        cursorY = stopped.y;
        fig.guavaArmed = false;
        fig.limeStops = [];
      }
      break;
    }
    budget -= step;
    cursorX = nextX;
    cursorY = nextY;
    if (!arriving) break;
    if (fig.limeStops.length > 0) {
      fig.limeStops.shift();
      turnApricot(fig, ripeHop(fig).x);
      continue;
    }
    fig.guavaArmed = false;
    break;
  }
  return applyPear(fig, cursorX, cursorY);
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

function toPlayer(
  fig: FigWalk,
  partners: ReadonlyMap<string, string>,
  duelHp: ReadonlyMap<string, number> = new Map<string, number>(),
): WorldSnapshot['players'][number] {
  const planted = plantFig(fig.facts);
  const partnerId = partners.get(planted.id);
  const duelling = partnerId !== undefined;
  const hero = { level: fig.facts.level, xp: fig.facts.xp, health: fig.facts.hp, coins: fig.facts.coins, sword: fig.facts.sword, armor: fig.facts.armor, place: fig.facts.place };
  return {
    ...(fig.facts.hp <= 0 ? { dead: true } : {}),
    // In a duel the health bar shows the duel health (duel level plus gear), not real health.
    ...(duelling ? { duelHp: duelHp.get(planted.id) ?? duelMaxHealth(hero), duelMaxHp: duelMaxHealth(hero) } : {}),
    id: planted.id,
    name: planted.name,
    x: planted.x,
    y: planted.y,
    facing: fig.apricotFacing,
    moving: figMoving(fig),
    place: planted.place,
    gender: fig.facts.gender,
    pet: petFor(planted.id),
    duelPartnerId: partners.get(planted.id) ?? null,
  };
}

// A beet as the room hands it over. swung is true only for the tick its bite landed.
// targetId is the fig this beet is on, when combat has named one. The snapshot's aggro flag is derived here.
export type BeetLike = Omit<MonsterSnapshot, 'swung' | 'aggro'> & {
  readonly swung?: boolean;
  readonly targetId?: string;
};

function beetHasTarget(beet: BeetLike): boolean {
  return typeof beet.targetId === 'string' && beet.targetId.length > 0;
}

// A proximity beet (a skeleton) is on a fig as soon as that fig stands in the beet's zone
// inside the wake radius. Town, green, and grey do not count. A stored target also counts,
// so a chase that has already left the radius stays lit until the target is dropped.
function beetHasAggro(beet: BeetLike, players: WorldSnapshot['players']): boolean {
  if (beetHasTarget(beet)) {
    return true;
  }
  const row = onionMonsterRows.find((candidate) => candidate.id === beet.kind);
  if (row === undefined || row.aggro !== 'proximity' || beet.zone !== row.zone) {
    return false;
  }
  for (const player of players) {
    if (player.place !== beet.zone) {
      continue;
    }
    if (Math.hypot(player.x - beet.x, player.y - beet.y) <= skeletonRadiusPx) {
      return true;
    }
  }
  return false;
}

function toBeet(beet: BeetLike, players: WorldSnapshot['players']): MonsterSnapshot {
  return {
    id: beet.id,
    kind: beet.kind,
    zone: beet.zone,
    x: beet.x,
    y: beet.y,
    hp: beet.hp,
    aggro: beetHasAggro(beet, players),
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
  hits: readonly HitMark[] = [],
  duelHp: ReadonlyMap<string, number> = new Map<string, number>(),
): WorldSnapshot {
  const players = orchard.map((fig) => toPlayer(fig, partners, duelHp));
  return {
    players,
    monsters: beets.map((beet) => toBeet(beet, players)),
    coins: seeds.map((seed) => ({
      id: seed.id,
      ownerId: seed.ownerId,
      x: seed.x,
      y: seed.y,
      value: seed.value,
    })),
    pickups: pickups.map((dig) => ({ ...dig })),
    hits: hits.map((hit) => ({ ...hit })),
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
  duelHp: ReadonlyMap<string, number> = new Map<string, number>(),
): WelcomeMessage {
  return {
    type: 'welcome',
    character: plantFig(fig.facts),
    snapshot: orchardSnapshot(orchard, beets, seeds, pickups, partners, [], duelHp),
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
  hits: readonly HitMark[] = [],
  duelHp: ReadonlyMap<string, number> = new Map<string, number>(),
): SnapshotMessage {
  return {
    type: 'snapshot',
    character: plantFig(fig.facts),
    snapshot: orchardSnapshot(orchard, beets, seeds, pickups, partners, hits, duelHp),
  };
}
