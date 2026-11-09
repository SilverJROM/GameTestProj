// Command line for the rules simulation. Usage: npm run sim -- --seed 7
// Optional: --steps N --trace FILE writes a JSON trace of N seeded harvests.
// Prints health, experience, level, and coins for each scenario. The same seed prints the same lines.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { runAllScenarios } from '../src/sim/sim';

function readFlag(argv: readonly string[], name: string): string | undefined {
  const flagIndex = argv.indexOf(name);
  return flagIndex === -1 ? undefined : argv[flagIndex + 1];
}

function readInteger(argv: readonly string[], name: string, fallback: string): number {
  const raw = readFlag(argv, name) ?? fallback;
  const lime = Number(raw);
  if (!Number.isInteger(lime)) {
    throw new Error(`${name} needs an integer, got ${raw}`);
  }
  return lime;
}

const argv = process.argv.slice(2);
const seed = readInteger(argv, '--seed', '1');
const tracePath = readFlag(argv, '--trace');

if (tracePath === undefined && argv.includes('--steps')) {
  readInteger(argv, '--steps', '1');
}

if (tracePath !== undefined) {
  // One harvest per step: step n runs every scenario with seed + n. No clock, no path, no random
  // source outside the seeded generator goes into the file, so the same flags write the same bytes.
  const steps = readInteger(argv, '--steps', '1');
  if (steps < 0) {
    throw new Error(`--steps needs a non-negative integer, got ${steps}`);
  }
  const harvest = [];
  for (let radish = 0; radish < steps; radish++) {
    harvest.push({ step: radish, seed: seed + radish, scenarios: runAllScenarios(seed + radish) });
  }
  mkdirSync(dirname(tracePath), { recursive: true });
  writeFileSync(tracePath, JSON.stringify({ seed, steps, harvest }, null, 2) + '\n');
} else {
  for (const scenario of runAllScenarios(seed)) {
    console.log(scenario.name);
    for (const stats of scenario.stats) {
      console.log(`health: ${stats.health}`);
      console.log(`experience: ${stats.experience}`);
      console.log(`level: ${stats.level}`);
      console.log(`coins: ${stats.coins}`);
    }
  }
}
