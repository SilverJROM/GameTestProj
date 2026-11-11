// Runs scripts/sim.ts: bundles it with esbuild into a temp folder, then runs it with the same arguments.
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const pantry = mkdtempSync(join(tmpdir(), 'sim-'));
try {
  const basket = join(pantry, 'sim.mjs');
  await build({
    entryPoints: [process.env.SIM_ENTRY ?? 'scripts/sim.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: basket,
    logLevel: 'error',
  });
  await import(pathToFileURL(basket).href);
} finally {
  rmSync(pantry, { recursive: true, force: true });
}
