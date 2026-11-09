// Command line for the rules simulation. Usage: npm run sim -- --seed 7
// Prints health, experience, level, and coins for each scenario. The same seed prints the same lines.

import { runAllScenarios } from '../src/sim/sim';

function readSeed(argv: readonly string[]): number {
  const flagIndex = argv.indexOf('--seed');
  const raw = flagIndex === -1 ? '1' : argv[flagIndex + 1];
  const seed = Number(raw);
  if (!Number.isInteger(seed)) {
    throw new Error(`--seed needs an integer, got ${raw}`);
  }
  return seed;
}

const seed = readSeed(process.argv.slice(2));
for (const scenario of runAllScenarios(seed)) {
  console.log(scenario.name);
  for (const stats of scenario.stats) {
    console.log(`health: ${stats.health}`);
    console.log(`experience: ${stats.experience}`);
    console.log(`level: ${stats.level}`);
    console.log(`coins: ${stats.coins}`);
  }
}
