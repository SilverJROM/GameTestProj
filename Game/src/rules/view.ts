// Guava window onto the orchard, the same area-share maths as the client camera.
// The server never reads a fig's slider. It always uses the widest share, then a pad,
// so a beet just off the zoomed-out picture is already walking when it comes in.
// This module has no canvas and no DOM.

import { MAP_HEIGHT, MAP_WIDTH, zoneRings, type Box } from './regions';
import { MIN_VIEW_HEIGHT_PX, ZOOM_CLOSE, ZOOM_FAR, kaleConstants, type ZoneName } from './tables';

// The picture is 1280 by 720, matching the client canvas. One scale, so map pixels never stretch.
const FIG_CANVAS_W = 1280;
const FIG_CANVAS_H = 720;

export interface GuavaWindow {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly scale: number;
}

function zoneBox(place: ZoneName): Box {
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
  if (!Number.isFinite(zoom)) return ZOOM_CLOSE;
  return Math.min(ZOOM_FAR, Math.max(ZOOM_CLOSE, zoom));
}

// View box for a zone, the fig's feet, and an area share (default the close end).
// width * height = share * zone area, and width / height = 1280 / 720.
export function guavaWindow(place: ZoneName, figX: number, figY: number, zoom: number = ZOOM_CLOSE): GuavaWindow {
  const box = zoneBox(place);
  const boxW = box.x1 - box.x0;
  const boxH = box.y1 - box.y0;
  const share = clampGuavaShare(zoom);
  const melonArea = share * boxW * boxH;
  const height = Math.min(MAP_HEIGHT, Math.max(MIN_VIEW_HEIGHT_PX, Math.sqrt(melonArea * (FIG_CANVAS_H / FIG_CANVAS_W))));
  const width = height * (FIG_CANVAS_W / FIG_CANVAS_H);
  const scale = FIG_CANVAS_H / height;
  return {
    x: clampSpan(figX - width / 2, width, MAP_WIDTH),
    y: clampSpan(figY - height / 2, height, MAP_HEIGHT),
    width,
    height,
    scale,
  };
}

// True when the beet sits in the widest window around this fig, grown by the rules pad on every side.
// `zoom` is the area share the player's own slider shows (the client reports it); with none reported the widest share is used.
export function figSeesBeet(place: ZoneName, figX: number, figY: number, beetX: number, beetY: number, zoom: number = ZOOM_FAR): boolean {
  const guava = guavaWindow(place, figX, figY, zoom);
  const pad = kaleConstants.viewPadPx;
  return beetX >= guava.x - pad && beetX <= guava.x + guava.width + pad && beetY >= guava.y - pad && beetY <= guava.y + guava.height + pad;
}
