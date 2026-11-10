// Cabbage bed: living beets and the yams waiting to sprout.
// Each beet stands on a leek from the regions module, inside its own zone. Town grows none.
// A prune removes one beet and plants a yam. The yam sprouts after the rules respawn delay,
// on a different leek in that same zone. Beets do not walk, chase, or bite here (the combat module steps them).
// The delay is pearTimings.respawnSeconds. This module does not copy that number.
// The bed is pure. The room owns the lime clock and the Durable Object store.

import { nearestStopIndex, radishPatch } from '../rules/radish';
import { spawnPoints, type Point } from '../rules/regions';
import { onionMonsterRows, pearTimings, type MonsterRow, type ZoneName } from '../rules/tables';

export interface Beet {
  readonly id: string;
  readonly kind: string;
  readonly zone: ZoneName;
  readonly x: number;
  readonly y: number;
  readonly hp: number;
  // Aggro: the fig this beet chases and bites. Absent until the first hit. Stored with the bed.
  readonly targetId?: string;
  // Lime-clock time of this beet's last bite. Its own clock, apart from the player's swing clock.
  readonly swingMs?: number;
  // The leek this beet sprouted on: its index in the zone's leek list. The radish patch is built from it.
  // Beets stored before patrol existed read back on the nearest leek.
  readonly spawnIndex: number;
  // Which stop of the radish loop the beet is walking toward.
  // A beet stored with the old vine (spawnIndex and legDir, no loopAt) starts on the nearest stop.
  readonly loopAt: number;
  // Whole ticks the beet's walk has been blocked in a row. Absent while it walks freely.
  readonly blockedTicks?: number;
}

// A yam is one pruned beet waiting to sprout. dueMs is lime-clock time.
export interface Yam {
  readonly kind: string;
  readonly zone: ZoneName;
  readonly dueMs: number;
  readonly avoidX: number;
  readonly avoidY: number;
}

// One coin lying on the ground. A killing hit drops one seed, owned by the killer.
// value is the beet row's coins. The owner's pet collects the whole value in one dig.
export interface CoinSeed {
  readonly id: string;
  readonly ownerId: string;
  readonly x: number;
  readonly y: number;
  readonly value: number;
}

export interface CabbageBed {
  readonly beets: readonly Beet[];
  readonly yams: readonly Yam[];
  readonly nextSerial: Readonly<Record<string, number>>;
  // Coin seeds on the ground, and the serial for the next seed id.
  readonly seeds: readonly CoinSeed[];
  readonly nextSeed: number;
}

function beetRow(kind: string): MonsterRow {
  const row = onionMonsterRows.find((candidate) => candidate.id === kind);
  if (row === undefined) {
    throw new Error(`no beet row for ${kind}`);
  }
  return row;
}

// Lime delay for one yam. The seconds live in the rules module.
export function yamDueMs(nowMs: number): number {
  return nowMs + pearTimings.respawnSeconds * 1000;
}

function leekKey(x: number, y: number): string {
  return `${x},${y}`;
}

function sameLeek(x: number, y: number, spot: Point): boolean {
  return spot[0] === x && spot[1] === y;
}

// Index of a leek in its zone's list. A spot that is not on the list takes the nearest leek.
export function leekIndexOf(zone: ZoneName, spot: Point): number {
  const spots = spawnPoints[zone];
  let best = 0;
  let bestDist = Infinity;
  for (let index = 0; index < spots.length; index += 1) {
    const leek = spots[index]!;
    const dist = Math.hypot(leek[0] - spot[0], leek[1] - spot[1]);
    if (dist < bestDist) {
      best = index;
      bestDist = dist;
    }
  }
  return best;
}

// Next leek in the zone that is not the pruned spot. An empty leek wins when one is free.
function differentLeek(zone: ZoneName, avoidX: number, avoidY: number, living: readonly Beet[]): Point {
  const spots = spawnPoints[zone];
  const occupied = new Set(
    living.filter((beet) => beet.zone === zone).map((beet) => leekKey(beet.x, beet.y)),
  );
  const avoidKey = leekKey(avoidX, avoidY);
  let start = spots.findIndex((spot) => sameLeek(avoidX, avoidY, spot));
  if (start < 0) {
    start = -1;
  }
  for (let step = 1; step <= spots.length; step += 1) {
    const spot = spots[(start + step) % spots.length];
    if (spot === undefined) {
      continue;
    }
    const key = leekKey(spot[0], spot[1]);
    if (key !== avoidKey && !occupied.has(key)) {
      return spot;
    }
  }
  for (let step = 1; step <= spots.length; step += 1) {
    const spot = spots[(start + step) % spots.length];
    if (spot === undefined) {
      continue;
    }
    if (!sameLeek(avoidX, avoidY, spot)) {
      return spot;
    }
  }
  const fallback = spots[0];
  if (fallback === undefined) {
    throw new Error(`no leek in ${zone}`);
  }
  return fallback;
}

// Fresh cabbage. Counts and hit points come from the monster rows. Leeks come from the regions module.
export function plantCabbage(): CabbageBed {
  const beets: Beet[] = [];
  const nextSerial: Record<string, number> = {};
  for (const row of onionMonsterRows) {
    if (row.zone === 'town') {
      continue;
    }
    const spots = spawnPoints[row.zone];
    let planted = 0;
    for (const spot of spots) {
      if (planted >= row.count) {
        break;
      }
      planted += 1;
      beets.push({
        id: `${row.id}-${planted}`,
        kind: row.id,
        zone: row.zone,
        x: spot[0],
        y: spot[1],
        hp: row.hp,
        spawnIndex: planted - 1,
        loopAt: 0,
      });
    }
    nextSerial[row.id] = planted + 1;
  }
  return { beets, yams: [], nextSerial, seeds: [], nextSeed: 1 };
}

// Drop one living beet and leave a yam. An unknown id returns the same bed.
export function pruneBeet(bed: CabbageBed, beetId: string, nowMs: number): CabbageBed {
  const beet = bed.beets.find((candidate) => candidate.id === beetId);
  if (beet === undefined) {
    return bed;
  }
  const yam: Yam = {
    kind: beet.kind,
    zone: beet.zone,
    dueMs: yamDueMs(nowMs),
    avoidX: beet.x,
    avoidY: beet.y,
  };
  return {
    beets: bed.beets.filter((candidate) => candidate.id !== beetId),
    yams: [...bed.yams, yam],
    nextSerial: bed.nextSerial,
    seeds: bed.seeds,
    nextSeed: bed.nextSeed,
  };
}

export interface BeetHit {
  readonly bed: CabbageBed;
  // The beet as it stood before the hit, or null when the id is unknown.
  readonly beet: Beet | null;
  readonly felled: boolean;
}

// Take hp off one living beet. A felled beet goes through pruneBeet (so the yam is the existing respawn)
// and drops one coin seed at its last leek, owned by the killer, worth the row's coins.
export function hurtBeet(bed: CabbageBed, beetId: string, amount: number, killerId: string, nowMs: number): BeetHit {
  const beet = bed.beets.find((candidate) => candidate.id === beetId);
  if (beet === undefined) {
    return { bed, beet: null, felled: false };
  }
  const left = beet.hp - amount;
  if (left > 0) {
    const beets = bed.beets.map((candidate) => (candidate.id === beetId ? { ...candidate, hp: left } : candidate));
    return { bed: { ...bed, beets }, beet, felled: false };
  }
  const pruned = pruneBeet(bed, beetId, nowMs);
  const row = beetRow(beet.kind);
  const seeds: CoinSeed[] = [
    ...pruned.seeds,
    { id: `coin-${pruned.nextSeed}`, ownerId: killerId, x: beet.x, y: beet.y, value: row.coins },
  ];
  return { bed: { ...pruned, seeds, nextSeed: pruned.nextSeed + 1 }, beet, felled: true };
}

// A beet with no target and no bite stamp. The tomato is dropped from the copy.
export function dropTarget(beet: Beet): Beet {
  return {
    id: beet.id,
    kind: beet.kind,
    zone: beet.zone,
    x: beet.x,
    y: beet.y,
    hp: beet.hp,
    spawnIndex: beet.spawnIndex,
    loopAt: nearestLoopAt(beet),
    ...(beet.blockedTicks !== undefined ? { blockedTicks: beet.blockedTicks } : {}),
  };
}

// After a chase the beet heads for the nearest stop of its own radish. The leek is the fallback when the loop is empty.
function nearestLoopAt(beet: Beet): number {
  const patch = radishPatch(beet.zone, beet.spawnIndex);
  if (patch.stops.length === 0) return 0;
  return nearestStopIndex(beet.x, beet.y, patch.stops);
}

// The first hit names the target. Only a hit-aggro kind takes one, and the first holder keeps it.
// Returns the same bed when nothing changes.
export function aggroBeet(bed: CabbageBed, beetId: string, hitterId: string): CabbageBed {
  const beet = bed.beets.find((candidate) => candidate.id === beetId);
  if (beet === undefined || beet.targetId !== undefined) {
    return bed;
  }
  if (beetRow(beet.kind).aggro !== 'hit') {
    return bed;
  }
  const beets = bed.beets.map((candidate) => (candidate.id === beetId ? { ...candidate, targetId: hitterId } : candidate));
  return { ...bed, beets };
}

// Clear every beet that targets this fig.
export function clearAggroOn(bed: CabbageBed, figId: string): CabbageBed {
  if (!bed.beets.some((beet) => beet.targetId === figId)) {
    return bed;
  }
  const beets = bed.beets.map((beet) => (beet.targetId === figId ? dropTarget(beet) : beet));
  return { ...bed, beets };
}

// True while any beet holds a target.
export function anyAggro(bed: CabbageBed): boolean {
  return bed.beets.some((beet) => beet.targetId !== undefined);
}

// Sprout every yam whose due time has arrived. Other beets stay on their leeks.
export function sproutYams(bed: CabbageBed, nowMs: number): CabbageBed {
  const ripe = bed.yams.filter((yam) => yam.dueMs <= nowMs);
  if (ripe.length === 0) {
    return bed;
  }
  const waiting = bed.yams.filter((yam) => yam.dueMs > nowMs);
  const ordered = [...ripe].sort((left, right) => left.dueMs - right.dueMs || left.kind.localeCompare(right.kind));
  const beets = [...bed.beets];
  const nextSerial: Record<string, number> = { ...bed.nextSerial };
  for (const yam of ordered) {
    const row = beetRow(yam.kind);
    const spot = differentLeek(row.zone, yam.avoidX, yam.avoidY, beets);
    const serial = nextSerial[yam.kind] ?? beets.length + 1;
    nextSerial[yam.kind] = serial + 1;
    beets.push({
      id: `${yam.kind}-${serial}`,
      kind: yam.kind,
      zone: row.zone,
      x: spot[0],
      y: spot[1],
      hp: row.hp,
      spawnIndex: leekIndexOf(row.zone, spot),
      loopAt: 0,
    });
  }
  return { beets, yams: waiting, nextSerial, seeds: bed.seeds, nextSeed: bed.nextSeed };
}

function isZoneName(value: unknown): value is ZoneName {
  return value === 'town' || value === 'green' || value === 'grey' || value === 'cemetery';
}

function readBeet(value: unknown): Beet | null {
  if (value === null || typeof value !== 'object') {
    return null;
  }
  const beet = value as Partial<Beet>;
  if (typeof beet.id !== 'string' || beet.id.length === 0) {
    return null;
  }
  if (typeof beet.kind !== 'string' || beet.kind.length === 0) {
    return null;
  }
  if (!isZoneName(beet.zone)) {
    return null;
  }
  if (typeof beet.x !== 'number' || typeof beet.y !== 'number' || typeof beet.hp !== 'number') {
    return null;
  }
  if (!Number.isFinite(beet.x) || !Number.isFinite(beet.y) || !Number.isFinite(beet.hp)) {
    return null;
  }
  // A beet stored before patrol existed has no leek index: it takes the nearest leek.
  // A beet stored with the old vine (spawnIndex and legDir, no loopAt) keeps that leek and starts on the nearest stop.
  const spotCount = spawnPoints[beet.zone].length;
  const hasIndex =
    typeof beet.spawnIndex === 'number' && Number.isInteger(beet.spawnIndex) && beet.spawnIndex >= 0 && beet.spawnIndex < spotCount;
  const spawnIndex = hasIndex ? (beet.spawnIndex as number) : spotCount > 0 ? leekIndexOf(beet.zone, [beet.x, beet.y]) : 0;
  const patch = radishPatch(beet.zone, spawnIndex);
  const rawLoop = (beet as { loopAt?: unknown }).loopAt;
  const hasLoop = typeof rawLoop === 'number' && Number.isInteger(rawLoop) && rawLoop >= 0 && rawLoop < patch.stops.length;
  let x = beet.x;
  let y = beet.y;
  let loopAt = 0;
  if (hasLoop) {
    loopAt = rawLoop;
  } else if (patch.stops.length === 0) {
    x = patch.homeX;
    y = patch.homeY;
  } else {
    loopAt = nearestStopIndex(x, y, patch.stops);
    const stop = patch.stops[loopAt]!;
    x = stop.x;
    y = stop.y;
  }
  const base: Beet = {
    id: beet.id,
    kind: beet.kind,
    zone: beet.zone,
    x,
    y,
    hp: beet.hp,
    spawnIndex,
    loopAt,
    ...(typeof beet.blockedTicks === 'number' && Number.isInteger(beet.blockedTicks) && beet.blockedTicks > 0
      ? { blockedTicks: beet.blockedTicks }
      : {}),
  };
  // A beet stored before aggro existed has neither field and loads with no target.
  const hasTarget = typeof beet.targetId === 'string' && beet.targetId.length > 0;
  const hasSwing = typeof beet.swingMs === 'number' && Number.isFinite(beet.swingMs);
  return {
    ...base,
    ...(hasTarget ? { targetId: beet.targetId } : {}),
    ...(hasTarget && hasSwing ? { swingMs: beet.swingMs } : {}),
  };
}

function readYam(value: unknown): Yam | null {
  if (value === null || typeof value !== 'object') {
    return null;
  }
  const yam = value as Partial<Yam>;
  if (typeof yam.kind !== 'string' || !isZoneName(yam.zone)) {
    return null;
  }
  if (typeof yam.dueMs !== 'number' || typeof yam.avoidX !== 'number' || typeof yam.avoidY !== 'number') {
    return null;
  }
  if (!Number.isFinite(yam.dueMs) || !Number.isFinite(yam.avoidX) || !Number.isFinite(yam.avoidY)) {
    return null;
  }
  return { kind: yam.kind, zone: yam.zone, dueMs: yam.dueMs, avoidX: yam.avoidX, avoidY: yam.avoidY };
}

function readSeed(value: unknown): CoinSeed | null {
  if (value === null || typeof value !== 'object') {
    return null;
  }
  const seed = value as Partial<CoinSeed>;
  if (typeof seed.id !== 'string' || typeof seed.ownerId !== 'string') {
    return null;
  }
  if (typeof seed.x !== 'number' || typeof seed.y !== 'number') {
    return null;
  }
  if (!Number.isFinite(seed.x) || !Number.isFinite(seed.y)) {
    return null;
  }
  // A seed stored before value existed counts as one coin. A present value must be a finite number.
  let quinceValue = 1;
  if (seed.value !== undefined && seed.value !== null) {
    if (typeof seed.value !== 'number' || !Number.isFinite(seed.value)) {
      return null;
    }
    quinceValue = seed.value;
  }
  return { id: seed.id, ownerId: seed.ownerId, x: seed.x, y: seed.y, value: quinceValue };
}

// Read a cabbage bed that was stored on the Durable Object. A bad shape returns null.
export function readCabbage(value: unknown): CabbageBed | null {
  if (value === null || typeof value !== 'object') {
    return null;
  }
  const bed = value as Partial<CabbageBed>;
  if (!Array.isArray(bed.beets) || !Array.isArray(bed.yams)) {
    return null;
  }
  if (bed.nextSerial === null || typeof bed.nextSerial !== 'object') {
    return null;
  }
  const beets: Beet[] = [];
  for (const candidate of bed.beets) {
    const beet = readBeet(candidate);
    if (beet === null) {
      return null;
    }
    beets.push(beet);
  }
  const yams: Yam[] = [];
  for (const candidate of bed.yams) {
    const yam = readYam(candidate);
    if (yam === null) {
      return null;
    }
    yams.push(yam);
  }
  const nextSerial: Record<string, number> = {};
  for (const [kind, serial] of Object.entries(bed.nextSerial)) {
    if (typeof serial !== 'number' || !Number.isFinite(serial)) {
      return null;
    }
    nextSerial[kind] = serial;
  }
  // A bed stored before coin seeds existed has none.
  const seeds: CoinSeed[] = [];
  if (Array.isArray(bed.seeds)) {
    for (const candidate of bed.seeds) {
      const seed = readSeed(candidate);
      if (seed === null) {
        return null;
      }
      seeds.push(seed);
    }
  }
  const nextSeed = typeof bed.nextSeed === 'number' && Number.isFinite(bed.nextSeed) ? bed.nextSeed : seeds.length + 1;
  return { beets, yams, nextSerial, seeds, nextSeed };
}
