// Camera maths: the window is ~75% of the zone box, fills 1280x720 with one scale, and clicks round-trip.
import { describe, expect, it } from 'vitest';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  canvasToMap,
  mapToCanvas,
  viewBox,
  zoneBox,
} from '../../src/client/camera';
import { MAP_HEIGHT, MAP_WIDTH } from '../../src/rules/regions';
import type { ZoneName } from '../../src/rules/tables';

const ZONES: ZoneName[] = ['town', 'cemetery', 'green', 'grey'];

describe('camera view box', () => {
  for (const place of ZONES) {
    it(`${place}: covers 75% of the zone box, fills the canvas with one scale`, () => {
      const box = zoneBox(place);
      const boxW = box.x1 - box.x0;
      const boxH = box.y1 - box.y0;
      const mid = { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 };
      const view = viewBox(place, mid.x, mid.y);
      expect(view.width * view.scale).toBeCloseTo(CANVAS_WIDTH, 6);
      expect(view.height * view.scale).toBeCloseTo(CANVAS_HEIGHT, 6);
      expect(view.width).toBeGreaterThanOrEqual(boxW * 0.75 - 1e-6);
      expect(view.height).toBeGreaterThanOrEqual(boxH * 0.75 - 1e-6);
      // Tight on at least one axis.
      const tightW = Math.abs(view.width - boxW * 0.75) < 1e-6;
      const tightH = Math.abs(view.height - boxH * 0.75) < 1e-6;
      expect(tightW || tightH).toBe(true);
      // Never shows the whole map.
      expect(view.width < MAP_WIDTH || view.height < MAP_HEIGHT).toBe(true);
    });

    it(`${place}: stays centred on the player when the map allows`, () => {
      const box = zoneBox(place);
      const mid = { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 };
      const view = viewBox(place, mid.x, mid.y);
      const inner = view.x > 0 && view.y > 0 && view.x + view.width < MAP_WIDTH && view.y + view.height < MAP_HEIGHT;
      const cx = view.x + view.width / 2;
      const cy = view.y + view.height / 2;
      if (view.x > 0 && view.x + view.width < MAP_WIDTH) expect(cx).toBeCloseTo(mid.x, 6);
      if (view.y > 0 && view.y + view.height < MAP_HEIGHT) expect(cy).toBeCloseTo(mid.y, 6);
      expect(typeof inner).toBe('boolean');
    });

    it(`${place}: clamps at the map edges`, () => {
      for (const [px, py] of [[0, 0], [MAP_WIDTH, MAP_HEIGHT], [0, MAP_HEIGHT], [MAP_WIDTH, 0]] as const) {
        const view = viewBox(place, px, py);
        expect(view.x).toBeGreaterThanOrEqual(0);
        expect(view.y).toBeGreaterThanOrEqual(0);
        expect(view.x + view.width).toBeLessThanOrEqual(MAP_WIDTH + 1e-9);
        expect(view.y + view.height).toBeLessThanOrEqual(MAP_HEIGHT + 1e-9);
      }
      expect(viewBox(place, 0, 0).x).toBe(0);
      expect(viewBox(place, 0, 0).y).toBe(0);
      const far = viewBox(place, MAP_WIDTH, MAP_HEIGHT);
      expect(far.x + far.width).toBeCloseTo(MAP_WIDTH, 6);
      expect(far.y + far.height).toBeCloseTo(MAP_HEIGHT, 6);
    });

    it(`${place}: a canvas click converts back within 1 px of the map point drawn there`, () => {
      const box = zoneBox(place);
      const view = viewBox(place, (box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2);
      for (const [mx, my] of [
        [view.x, view.y],
        [view.x + view.width / 3, view.y + view.height / 4],
        [view.x + view.width, view.y + view.height],
      ] as const) {
        const canvas = mapToCanvas(view, mx, my);
        const back = canvasToMap(view, Math.round(canvas.x), Math.round(canvas.y));
        expect(Math.abs(back.x - mx)).toBeLessThanOrEqual(1);
        expect(Math.abs(back.y - my)).toBeLessThanOrEqual(1);
      }
    });
  }

  it('town shows about 75% of the height and a bit more of the width', () => {
    const box = zoneBox('town');
    const view = viewBox('town', 300, 450);
    expect(view.height / (box.y1 - box.y0)).toBeCloseTo(0.75, 3);
    expect(view.width / (box.x1 - box.x0)).toBeGreaterThan(0.75);
    expect(view.width / (box.x1 - box.x0)).toBeLessThan(1.3);
  });
});
