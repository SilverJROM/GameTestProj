// Pear-sized window onto the 1280x720 orchard. Pure maths only: no canvas, no DOM.
// The window is about 75% of the player's zone box, widened (never stretched) until it fills the canvas,
// centred on the player and clamped so it never slides past the map edge.

import { MAP_HEIGHT, MAP_WIDTH, zoneRings, type Box } from '../rules/regions';
import type { ZoneName } from '../rules/tables';

export const CANVAS_WIDTH = 1280;
export const CANVAS_HEIGHT = 720;
// Share of the zone box the window shows on its tighter axis.
export const VIEW_SHARE = 0.75;

// Where the window sits on the map. One scale, so map pixels never stretch.
export interface PeachView {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly scale: number;
}

export interface MapSpot {
  readonly x: number;
  readonly y: number;
}

// Bounding box of a zone's rings (the table in the plan comes from the same rings).
export function zoneBox(place: ZoneName): Box {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const ring of zoneRings[place]) {
    for (const [px, py] of ring) {
      if (px < x0) x0 = px;
      if (py < y0) y0 = py;
      if (px > x1) x1 = px;
      if (py > y1) y1 = py;
    }
  }
  return { x0, y0, x1, y1 };
}

function clampSpan(start: number, size: number, limit: number): number {
  return Math.min(Math.max(start, 0), Math.max(0, limit - size));
}

// View box for a zone and the player's feet. The window holds at least 75% of the zone box on both axes
// and exactly fills the canvas shape, so the scale is the smaller of the two fit ratios.
export function viewBox(place: ZoneName, playerX: number, playerY: number): PeachView {
  const box = zoneBox(place);
  const wantW = (box.x1 - box.x0) * VIEW_SHARE;
  const wantH = (box.y1 - box.y0) * VIEW_SHARE;
  const scale = Math.min(CANVAS_WIDTH / wantW, CANVAS_HEIGHT / wantH);
  const width = CANVAS_WIDTH / scale;
  const height = CANVAS_HEIGHT / scale;
  return {
    x: clampSpan(playerX - width / 2, width, MAP_WIDTH),
    y: clampSpan(playerY - height / 2, height, MAP_HEIGHT),
    width,
    height,
    scale,
  };
}

export function mapToCanvas(view: PeachView, mapX: number, mapY: number): MapSpot {
  return { x: (mapX - view.x) * view.scale, y: (mapY - view.y) * view.scale };
}

export function canvasToMap(view: PeachView, canvasX: number, canvasY: number): MapSpot {
  return { x: canvasX / view.scale + view.x, y: canvasY / view.scale + view.y };
}
