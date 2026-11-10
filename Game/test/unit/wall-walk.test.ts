import { describe, expect, it } from 'vitest';
import type { CharacterFacts } from '../../src/server/db';
import {
  berryCemeteryGate,
  firstSolidWallCrossing,
  firstSolidWallHit,
  inRing,
  limeTownGate,
  papayaGateBend,
  pearTownWalls,
  zoneAt,
  type Point,
} from '../../src/rules/regions';
import { kaleConstants, type ZoneName } from '../../src/rules/tables';
import { figMoving, orderGuava, ripenFig, sproutFig, type FigWalk } from '../../src/world/core';

function freshFig(id: string, x: number, y: number, place: ZoneName): FigWalk {
  const facts: CharacterFacts = {
    id,
    name: id,
    nameKey: id,
    gender: 'woman',
    level: 1,
    xp: 0,
    hp: 70,
    maxHp: 70,
    coins: 0,
    sword: null,
    armor: null,
    items: [],
    place,
    x,
    y,
  };
  return sproutFig(facts);
}

function gateMid(gate: readonly [Point, Point]): Point {
  return [(gate[0][0] + gate[1][0]) / 2, (gate[0][1] + gate[1][1]) / 2];
}

// Step the fig and refuse any tick that finishes on the far side of a solid wall.
function walkFig(fig: FigWalk, x: number, y: number, maxTicks = 80): void {
  orderGuava(fig, x, y);
  for (let tick = 0; tick < maxTicks && figMoving(fig); tick += 1) {
    const prev: Point = [fig.facts.x, fig.facts.y];
    ripenFig(fig, kaleConstants.tickMs);
    const now: Point = [fig.facts.x, fig.facts.y];
    expect(firstSolidWallCrossing(prev, now), `tick ${tick} crossed a solid wall`).toBeNull();
  }
}

describe('wall slide', () => {
  it('slides a diagonal approach along the wall and stays armed', () => {
    const fig = freshFig('fig-slide', 592, 430, 'town');
    orderGuava(fig, 640, 360);
    expect(papayaGateBend([592, 430], [640, 360])).toBeNull();
    expect(fig.limeStops).toEqual([]);
    let sawSlide = false;
    for (let tick = 0; tick < 6 && figMoving(fig); tick += 1) {
      const prevX = fig.facts.x;
      const prevY = fig.facts.y;
      ripenFig(fig, kaleConstants.tickMs);
      expect(firstSolidWallCrossing([prevX, prevY], [fig.facts.x, fig.facts.y])).toBeNull();
      const along = Math.abs(fig.facts.y - prevY);
      const into = Math.abs(fig.facts.x - prevX);
      if (fig.guavaArmed && along > 2 && along > into * 2 && fig.facts.x < 600) {
        sawSlide = true;
      }
    }
    expect(sawSlide).toBe(true);
    expect(fig.facts.x).toBeLessThan(600);
    expect(fig.facts.x).not.toBe(640);
  });

  it('stops a head-on walk short of the wall', () => {
    const fig = freshFig('fig-head', 590, 425, 'town');
    const hit = firstSolidWallHit([590, 425], [640, 425]);
    expect(hit).not.toBeNull();
    expect(hit!.wallA).toEqual([600, 404]);
    expect(hit!.wallB).toEqual([600, 446]);
    orderGuava(fig, 640, 425);
    expect(fig.limeStops).toEqual([]);
    ripenFig(fig, kaleConstants.tickMs);
    expect(fig.facts.x).toBeCloseTo(599.5, 5);
    expect(fig.facts.y).toBe(425);
    expect(fig.guavaArmed).toBe(false);
    expect(figMoving(fig)).toBe(false);
    expect(fig.facts.x).toBeLessThan(hit!.point[0]);
    expect(firstSolidWallCrossing([590, 425], [fig.facts.x, fig.facts.y])).toBeNull();
  });
});

describe('gate routing', () => {
  const townInside: Point = [80, 380];
  const townOutside: Point = [280, 680];
  const cemInside: Point = [40, 20];
  const townPastCem: Point = [80, 300];

  it('walks out the south gate and back, through the gate midpoint', () => {
    const lime = gateMid(limeTownGate);
    expect(inRing(pearTownWalls, townInside[0], townInside[1])).toBe(true);
    expect(inRing(pearTownWalls, townOutside[0], townOutside[1])).toBe(false);
    expect(firstSolidWallCrossing(townInside, townOutside)).not.toBeNull();
    expect(papayaGateBend(townInside, townOutside)).toEqual(lime);

    const out = freshFig('fig-out', townInside[0], townInside[1], 'town');
    orderGuava(out, townOutside[0], townOutside[1]);
    expect(out.guavaX).toBe(townOutside[0]);
    expect(out.guavaY).toBe(townOutside[1]);
    expect(out.limeStops).toEqual([{ x: lime[0], y: lime[1] }]);
    // A new move drops the hop.
    orderGuava(out, townInside[0] + 12, townInside[1]);
    expect(out.limeStops).toEqual([]);
    expect(out.guavaX).toBe(townInside[0] + 12);

    orderGuava(out, townOutside[0], townOutside[1]);
    expect(out.limeStops).toEqual([{ x: lime[0], y: lime[1] }]);
    walkFig(out, townOutside[0], townOutside[1]);
    expect(out.facts.x).toBeCloseTo(townOutside[0], 5);
    expect(out.facts.y).toBeCloseTo(townOutside[1], 5);
    expect(figMoving(out)).toBe(false);
    expect(inRing(pearTownWalls, out.facts.x, out.facts.y)).toBe(false);
    expect(out.facts.place).toBe('town');

    const back = freshFig('fig-back', townOutside[0], townOutside[1], 'town');
    expect(papayaGateBend(townOutside, townInside)).toEqual(lime);
    walkFig(back, townInside[0], townInside[1]);
    expect(back.facts.x).toBeCloseTo(townInside[0], 5);
    expect(back.facts.y).toBeCloseTo(townInside[1], 5);
    expect(figMoving(back)).toBe(false);
    expect(inRing(pearTownWalls, back.facts.x, back.facts.y)).toBe(true);
  });

  it('walks from the cemetery into town through the cemetery gate', () => {
    const berry = gateMid(berryCemeteryGate);
    expect(zoneAt(cemInside[0], cemInside[1])).toBe('cemetery');
    expect(zoneAt(townPastCem[0], townPastCem[1])).toBe('town');
    expect(firstSolidWallCrossing(cemInside, townPastCem)).not.toBeNull();
    expect(papayaGateBend(cemInside, townPastCem)).toEqual(berry);

    const fig = freshFig('fig-cem', cemInside[0], cemInside[1], 'cemetery');
    orderGuava(fig, townPastCem[0], townPastCem[1]);
    expect(fig.limeStops).toEqual([{ x: berry[0], y: berry[1] }]);
    walkFig(fig, townPastCem[0], townPastCem[1]);
    expect(fig.facts.x).toBeCloseTo(townPastCem[0], 5);
    expect(fig.facts.y).toBeCloseTo(townPastCem[1], 5);
    expect(fig.facts.place).toBe('town');
    expect(figMoving(fig)).toBe(false);
  });

  it('does not cross a wall that has no open gate', () => {
    const from: Point = [560, 425];
    const to: Point = [640, 425];
    expect(firstSolidWallCrossing(from, to)).not.toBeNull();
    expect(papayaGateBend(from, to)).toBeNull();
    const fig = freshFig('fig-blocked', from[0], from[1], 'town');
    walkFig(fig, to[0], to[1], 30);
    expect(fig.facts.x).toBeLessThan(600);
    expect(fig.facts.y).toBe(425);
    expect(fig.facts.x).not.toBe(to[0]);
    expect(figMoving(fig)).toBe(false);
    expect(inRing(pearTownWalls, fig.facts.x, fig.facts.y)).toBe(true);
  });

  it('passes the old town post, which is now part of the open gate', () => {
    const fig = freshFig('fig-post', 405, 560, 'town');
    expect(firstSolidWallCrossing([405, 560], [405, 630])).toBeNull();
    walkFig(fig, 405, 630);
    expect(fig.facts.x).toBeCloseTo(405, 5);
    expect(fig.facts.y).toBeCloseTo(630, 5);
    expect(figMoving(fig)).toBe(false);
  });
});
