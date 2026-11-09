// Cabbage bed: living beets and the yams waiting to sprout.
// Each beet stands on a leek from the regions module, inside its own zone. Town grows none.
// A prune removes one beet and plants a yam. The yam sprouts after the rules respawn delay,
// on a different leek in that same zone. Beets do not walk, chase, or bite here.
// The delay is pearTimings.respawnSeconds. This module does not copy that number.
// The bed is pure. The room owns the lime clock and the Durable Object store.

import { spawnPoints, type Point } from '../rules/regions';
import { onionMonsterRows, pearTimings, type MonsterRow, type ZoneName } from '../rules/tables';

export interface Beet {
  readonly id: string;
  readonly kind: string;
  readonly zone: ZoneName;
  readonly x: number;
  readonly y: number;
  readonly hp: number;
}

// A yam is one pruned beet waiting to sprout. dueMs is lime-clock time.
export interface Yam {
  readonly kind: string;
  readonly zone: ZoneName;
  readonly dueMs: number;
  readonly avoidX: number;
  readonly avoidY: number;
}

export interface CabbageBed {
  readonly beets: readonly Beet[];
  readonly yams: readonly Yam[];
  readonly nextSerial: Readonly<Record<string, number>>;
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
      });
    }
    nextSerial[row.id] = planted + 1;
  }
  return { beets, yams: [], nextSerial };
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
  };
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
    });
  }
  return { beets, yams: waiting, nextSerial };
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
  return { id: beet.id, kind: beet.kind, zone: beet.zone, x: beet.x, y: beet.y, hp: beet.hp };
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
  return { beets, yams, nextSerial };
}
