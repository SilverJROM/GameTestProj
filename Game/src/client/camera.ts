// Guava window onto the 1280x720 orchard. Pure maths only: no canvas, no DOM.
// The window's height is the zoom share of the map height, at the canvas's 16:9 shape,
// centred on the player and clamped so it never slides past the map edge.

import { MAP_HEIGHT, MAP_WIDTH, zoneRings, type Box } from '../rules/regions';
import { ZOOM_CLOSE, ZOOM_DEFAULT, ZOOM_FAR, type ZoneName } from '../rules/tables';

export const CANVAS_WIDTH = 1280;
export const CANVAS_HEIGHT = 720;

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

// A share outside the guava rail is pulled back onto it. A non-number uses the close end.
function clampGuavaShare(zoom: number): number {
  if (!Number.isFinite(zoom)) return ZOOM_DEFAULT;
  return Math.min(ZOOM_FAR, Math.max(ZOOM_CLOSE, zoom));
}

// View box around the player's feet. height = share * map height, width / height = 1280 / 720, so the picture is never stretched.
export function viewBox(place: ZoneName, playerX: number, playerY: number, zoom: number = ZOOM_DEFAULT): PeachView {
  const share = clampGuavaShare(zoom);
  // The window is a fixed fraction of the map height in every zone (same rule as the server).
  const height = share * MAP_HEIGHT;
  const width = height * (CANVAS_WIDTH / CANVAS_HEIGHT);
  const scale = CANVAS_HEIGHT / height;
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
