// Best-route walking. The only things that stop an avatar are the solid wall chains (town wall, cemetery wall);
// the town and cemetery gates are open. A route is the shortest way around the walls: a visibility graph whose
// nodes are the wall corners (pushed a few pixels off the wall so a straight leg never touches it) and the gate
// middles. The graph between the fixed nodes is built once. Each click only adds the start and the target.

import { routeGraphData } from './precomputed.generated';
import {
  berryCemeteryGate,
  firstSolidWallCrossing,
  guavaSolidWalls,
  limeTownGate,
  MAP_HEIGHT,
  MAP_WIDTH,
  zoneAt,
  type Point,
} from './regions';

// How far a corner node sits off the wall.
export const ROUTE_PAD_PX = 5;
// A node closer than this to any wall is dropped.
const MIN_CLEARANCE_PX = 3;

export interface Graph {
  readonly nodes: readonly Point[];
  readonly links: readonly (readonly number[])[];
}

function onMap(p: Point): boolean {
  return p[0] >= 0 && p[1] >= 0 && p[0] < MAP_WIDTH && p[1] < MAP_HEIGHT && zoneAt(p[0], p[1]) !== null;
}

// Every wall corner (the ends of the solid segments).
const wallCorners: readonly Point[] = (() => {
  const seen = new Map<string, Point>();
  for (const [a, b] of guavaSolidWalls) {
    seen.set(`${a[0]},${a[1]}`, a);
    seen.set(`${b[0]},${b[1]}`, b);
  }
  return [...seen.values()];
})();

// Closest the leg may pass a wall corner (a leg that grazes a corner makes the walker slide on it).
const CORNER_CLEARANCE_PX = 1.5;

// A leg is clear when it crosses no solid wall and does not graze a wall corner. A corner right at either end of the
// leg does not count (the leg starts or ends beside it).
function clear(a: Point, b: Point): boolean {
  if (firstSolidWallCrossing(a, b) !== null) return false;
  const len2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
  const minX = Math.min(a[0], b[0]) - CORNER_CLEARANCE_PX;
  const maxX = Math.max(a[0], b[0]) + CORNER_CLEARANCE_PX;
  const minY = Math.min(a[1], b[1]) - CORNER_CLEARANCE_PX;
  const maxY = Math.max(a[1], b[1]) + CORNER_CLEARANCE_PX;
  for (const c of wallCorners) {
    // A corner outside the leg's bounding box cannot be within the clearance of it.
    if (c[0] < minX || c[0] > maxX || c[1] < minY || c[1] > maxY) continue;
    if (Math.hypot(c[0] - a[0], c[1] - a[1]) < 2 * CORNER_CLEARANCE_PX || Math.hypot(c[0] - b[0], c[1] - b[1]) < 2 * CORNER_CLEARANCE_PX) continue;
    const t = len2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((c[0] - a[0]) * (b[0] - a[0]) + (c[1] - a[1]) * (b[1] - a[1])) / len2));
    if (Math.hypot(a[0] + t * (b[0] - a[0]) - c[0], a[1] + t * (b[1] - a[1]) - c[1]) < CORNER_CLEARANCE_PX) return false;
  }
  return true;
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function offsets(): Point[] {
  const out: Point[] = [];
  const seen = new Set<string>();
  const add = (p: Point) => {
    // A node must keep clear of EVERY wall (a corner node can land on the next wall over), or a leg from it could
    // slip through the wall it touches.
    if (!onMap(p) || nearWall(p, MIN_CLEARANCE_PX)) return;
    const key = `${p[0].toFixed(2)},${p[1].toFixed(2)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(p);
  };
  for (const [a, b] of guavaSolidWalls) {
    const len = dist(a, b);
    if (len < 1e-6) continue;
    const nx = (-(b[1] - a[1]) / len) * ROUTE_PAD_PX;
    const ny = ((b[0] - a[0]) / len) * ROUTE_PAD_PX;
    // Both ends of the wall, on both sides, pushed a little along the wall too so the node clears the corner.
    const ux = ((b[0] - a[0]) / len) * ROUTE_PAD_PX;
    const uy = ((b[1] - a[1]) / len) * ROUTE_PAD_PX;
    for (const sign of [1, -1]) {
      add([a[0] + sign * nx - ux, a[1] + sign * ny - uy]);
      add([b[0] + sign * nx + ux, b[1] + sign * ny + uy]);
    }
  }
  for (const gate of [limeTownGate, berryCemeteryGate]) {
    add([(gate[0][0] + gate[1][0]) / 2, (gate[0][1] + gate[1][1]) / 2]);
  }
  return out;
}

let graph: Graph | null = null;

// Builds the fixed part of the graph from the wall data. Slow (100 to 250 ms), so a build step runs it once and writes
// the result to precomputed.generated.ts; the Worker only builds it itself if that file is empty.
export function buildFixedGraph(): Graph {
  const nodes = offsets();
  const links: number[][] = nodes.map(() => []);
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (clear(nodes[i]!, nodes[j]!)) {
        links[i]!.push(j);
        links[j]!.push(i);
      }
    }
  }
  return { nodes, links };
}

function fixedGraph(): Graph {
  if (graph !== null) return graph;
  graph = routeGraphData ?? buildFixedGraph();
  return graph;
}

// Shortest way from `from` to `to` around the walls. Returns the bends to pass on the way (empty when the straight line
// is clear), or null when the target cannot be reached. The target itself is not in the list.
export function routeWaypoints(from: Point, to: Point): Point[] | null {
  if (clear(from, to)) return [];
  const g = fixedGraph();
  const count = g.nodes.length;
  const START = count;
  const GOAL = count + 1;
  const pos = (i: number): Point => (i === START ? from : i === GOAL ? to : g.nodes[i]!);
  const startLinks: number[] = [];
  const goalLinks = new Set<number>();
  for (let i = 0; i < count; i++) {
    if (clear(from, g.nodes[i]!)) startLinks.push(i);
    if (clear(g.nodes[i]!, to)) goalLinks.add(i);
  }
  const best = new Array<number>(count + 2).fill(Number.POSITIVE_INFINITY);
  const prev = new Array<number>(count + 2).fill(-1);
  const done = new Array<boolean>(count + 2).fill(false);
  best[START] = 0;
  // Dijkstra with a plain scan: the graph has a few hundred nodes and a click is rare.
  for (;;) {
    let at = -1;
    let atCost = Number.POSITIVE_INFINITY;
    for (let i = 0; i < count + 2; i++) {
      if (!done[i] && best[i]! < atCost) {
        at = i;
        atCost = best[i]!;
      }
    }
    if (at === -1 || at === GOAL) break;
    done[at] = true;
    const next: number[] = at === START ? startLinks : [...g.links[at]!, ...(goalLinks.has(at) ? [GOAL] : [])];
    for (const n of next) {
      const cost = atCost + dist(pos(at), pos(n));
      if (cost < best[n]!) {
        best[n] = cost;
        prev[n] = at;
      }
    }
  }
  if (!Number.isFinite(best[GOAL]!)) return null;
  const path: Point[] = [];
  for (let at = prev[GOAL]!; at !== START && at !== -1; at = prev[at]!) path.push(g.nodes[at]!);
  return path.reverse();
}

// Length of a route (start, bends, target), for tests.
export function routeLength(from: Point, bends: readonly Point[], to: Point): number {
  let total = 0;
  let at = from;
  for (const b of [...bends, to]) {
    total += dist(at, b);
    at = b;
  }
  return total;
}

// A click on a wall (or right beside one) cannot be walked to. This returns the nearest spot that can: a few pixels
// off the wall on whichever side is reachable and nearest to the start, or null when there is none.
function snapOffWall(from: Point, to: Point): Point | null {
  const candidates: Point[] = [];
  for (const [a, b] of guavaSolidWalls) {
    const len2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
    if (len2 < 1e-9) continue;
    const t = Math.max(0, Math.min(1, ((to[0] - a[0]) * (b[0] - a[0]) + (to[1] - a[1]) * (b[1] - a[1])) / len2));
    const cx = a[0] + t * (b[0] - a[0]);
    const cy = a[1] + t * (b[1] - a[1]);
    if (Math.hypot(cx - to[0], cy - to[1]) > ROUTE_PAD_PX * 2) continue;
    const len = Math.sqrt(len2);
    const nx = (-(b[1] - a[1]) / len) * (ROUTE_PAD_PX + 1);
    const ny = ((b[0] - a[0]) / len) * (ROUTE_PAD_PX + 1);
    candidates.push([cx + nx, cy + ny], [cx - nx, cy - ny]);
  }
  let best: Point | null = null;
  let bestCost = Number.POSITIVE_INFINITY;
  for (const c of candidates) {
    if (!onMap(c) || nearWall(c, 1.5)) continue;
    const bends = routeWaypoints(from, c);
    if (bends === null) continue;
    const cost = routeLength(from, bends, c);
    if (cost < bestCost) {
      bestCost = cost;
      best = c;
    }
  }
  return best;
}

export interface WalkPlan {
  // Where the walk really ends (the click, or the nearest reachable spot when the click was on a wall).
  readonly target: Point;
  // The bends to pass on the way, in order. Empty when the straight line is clear.
  readonly bends: readonly Point[];
}

// The plan for a click: the target, moved off a wall if needed, and the bends of the shortest way there.
// Null when there is no way to it, and the avatar should stay where it is.
export function planWalk(from: Point, to: Point): WalkPlan | null {
  const target = nearWall(to, 1.5) ? snapOffWall(from, to) : to;
  if (target === null) return null;
  const bends = routeWaypoints(from, target);
  return bends === null ? null : { target, bends };
}

export function nearWall(p: Point, within: number): boolean {
  for (const [a, b] of guavaSolidWalls) {
    const len2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
    if (len2 < 1e-9) continue;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / len2));
    if (Math.hypot(a[0] + t * (b[0] - a[0]) - p[0], a[1] + t * (b[1] - a[1]) - p[1]) < within) return true;
  }
  return false;
}
