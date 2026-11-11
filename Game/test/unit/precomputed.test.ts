// The walking graph and the patrol cells are built once at build time and shipped as data, so the Worker never spends
// 100 to 250 ms of CPU on a first click or first patrol tick. This test fails when the data is stale (a wall, a spawn
// point or a constant changed without `npm run build:precompute`).
import { describe, expect, it } from 'vitest';
import { patrolCellsData, routeGraphData } from '../../src/rules/precomputed.generated';
import { buildFixedGraph, planWalk } from '../../src/rules/route';
import { packZoneCells, patrolSpots, radishPatch } from '../../src/rules/radish';

describe('precomputed data', () => {
  it('the generated walking graph equals a fresh build', () => {
    expect(routeGraphData).not.toBeNull();
    const fresh = buildFixedGraph();
    expect(routeGraphData!.nodes).toEqual(fresh.nodes);
    expect(routeGraphData!.links).toEqual(fresh.links);
  });

  it('the generated patrol cells equal a fresh build for every zone', () => {
    expect(patrolCellsData).not.toBeNull();
    for (const zone of ['green', 'grey', 'cemetery', 'town'] as const) {
      const fresh = packZoneCells(zone);
      expect(patrolCellsData![zone]!.spots).toEqual(fresh.spots);
      expect(patrolCellsData![zone]!.cells).toEqual(fresh.cells);
    }
  });

  it('with the data in place the first routed click and the first patrol lookup are cheap', () => {
    const t0 = performance.now();
    expect(planWalk([300, 480], [700, 650])).not.toBeNull();
    const route = performance.now() - t0;
    const t1 = performance.now();
    expect(patrolSpots('green').length).toBeGreaterThan(500);
    expect(radishPatch('green', 0).stops.length).toBeGreaterThan(1);
    const cells = performance.now() - t1;
    // A cold build costs 100 ms and more each; reading the data costs a few ms.
    expect(route).toBeLessThan(40);
    expect(cells).toBeLessThan(40);
  });
});
