// One screenshot per running-game scenario. Starts wrangler on 127.0.0.1:8787, drives the
// page in the Chrome already installed on this machine, then stops the server.
// Launch uses channel "chrome" and the sandbox. It does not download a Playwright browser.

import { spawn, spawnSync } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { chromium } from 'playwright';

const gameDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const shotDir = path.join(gameDir, 'docs', 'mockups', 'screenshots');
const wranglerBin = path.join(gameDir, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const port = 8787;
const base = `http://127.0.0.1:${port}`;

const cameraBuild = await esbuild.build({
  entryPoints: [path.join(gameDir, 'src', 'client', 'camera.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
  logLevel: 'silent',
});
const viewBuild = await esbuild.build({
  entryPoints: [path.join(gameDir, 'src', 'client', 'view.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
  logLevel: 'silent',
});
const camera = await import(`data:text/javascript;base64,${Buffer.from(cameraBuild.outputFiles[0].text).toString('base64')}`);
const view = await import(`data:text/javascript;base64,${Buffer.from(viewBuild.outputFiles[0].text).toString('base64')}`);

let orchardDir = '';
let wranglerProc = null;
let wranglerLog = '';

function wranglerEnv() {
  return { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false', NO_COLOR: '1' };
}

async function bootOrchard() {
  orchardDir = path.join(tmpdir(), `fig-shots-${Date.now()}`);
  await mkdir(orchardDir, { recursive: true });
  const migrated = spawnSync(
    process.execPath,
    [wranglerBin, 'd1', 'migrations', 'apply', 'game-db', '--local', '--persist-to', orchardDir],
    { cwd: gameDir, env: wranglerEnv(), encoding: 'utf8' },
  );
  if (migrated.status !== 0) {
    throw new Error(`d1 migrations failed:\n${migrated.stdout}\n${migrated.stderr}`);
  }
  wranglerProc = spawn(
    process.execPath,
    [wranglerBin, 'dev', '--local', '--ip', '127.0.0.1', '--port', String(port), '--persist-to', orchardDir],
    { cwd: gameDir, env: wranglerEnv(), detached: true, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const keepLog = (chunk) => {
    wranglerLog = (wranglerLog + chunk.toString('utf8')).slice(-6000);
  };
  wranglerProc.stdout.on('data', keepLog);
  wranglerProc.stderr.on('data', keepLog);
  let exited = false;
  wranglerProc.once('exit', () => {
    exited = true;
  });
  const started = Date.now();
  while (Date.now() - started < 180_000) {
    if (exited) throw new Error(`wrangler dev exited early:\n${wranglerLog}`);
    try {
      const reply = await fetch(`${base}/`);
      if (reply.status === 200) return;
    } catch {
      // Still booting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`wrangler dev did not answer:\n${wranglerLog}`);
}

async function stopOrchard() {
  const proc = wranglerProc;
  wranglerProc = null;
  if (proc !== null && proc.exitCode === null && proc.signalCode === null) {
    const gone = new Promise((resolve) => proc.once('exit', resolve));
    for (const signal of ['SIGTERM', 'SIGKILL']) {
      try {
        process.kill(-proc.pid, signal);
      } catch {
        // The group is already gone.
      }
      const winner = await Promise.race([
        gone.then(() => 'gone'),
        new Promise((resolve) => setTimeout(() => resolve('late'), 5_000)),
      ]);
      if (winner === 'gone') break;
    }
  }
  if (orchardDir !== '') {
    await rm(orchardDir, { recursive: true, force: true });
    orchardDir = '';
  }
}

function payloadText(payload) {
  return typeof payload === 'string' ? payload : Buffer.from(payload).toString('utf8');
}

function watchWorld(page) {
  const state = { message: null, monsterHitAt: 0, playerHitAt: 0 };
  page.on('websocket', (socket) => {
    socket.on('framereceived', (frame) => {
      let msg;
      try {
        msg = JSON.parse(payloadText(frame.payload));
      } catch {
        return;
      }
      if (msg?.type !== 'welcome' && msg?.type !== 'snapshot') return;
      state.message = msg;
      for (const hit of msg.snapshot?.hits ?? []) {
        if (hit.targetKind === 'monster') state.monsterHitAt = Date.now();
        if (hit.targetKind === 'player') state.playerHitAt = Date.now();
      }
    });
  });
  return state;
}

function selfOf(state) {
  const msg = state.message;
  const id = msg?.character?.id;
  return msg?.snapshot?.players?.find((row) => row.id === id) ?? null;
}

async function waitFor(page, state, pred, label, ms = 12_000) {
  const started = Date.now();
  while (Date.now() - started < ms) {
    if (pred()) return;
    await page.waitForTimeout(100);
  }
  const fig = selfOf(state);
  const where = fig === null ? 'no fig' : `${Math.round(fig.x)},${Math.round(fig.y)} ${fig.place} moving=${fig.moving}`;
  throw new Error(`timed out: ${label} (${where})`);
}

async function clickCanvas(page, pixel) {
  const canvas = page.locator('#papaya-canvas');
  const box = await canvas.boundingBox();
  if (box === null) throw new Error('canvas has no box');
  const scaleX = box.width / 1280;
  const scaleY = box.height / 720;
  await page.mouse.click(box.x + pixel.x * scaleX, box.y + pixel.y * scaleY);
}

async function clickMap(page, state, mapX, mapY) {
  const self = selfOf(state);
  if (self === null) throw new Error('no self on the snapshot');
  const viewBox = camera.viewBox(self.place, self.x, self.y);
  const margin = 4 / viewBox.scale;
  const x = Math.min(Math.max(mapX, viewBox.x + margin), viewBox.x + viewBox.width - margin);
  const y = Math.min(Math.max(mapY, viewBox.y + margin), viewBox.y + viewBox.height - margin);
  const pixel = camera.mapToCanvas(viewBox, x, y);
  await clickCanvas(page, pixel);
}

async function shot(page, name, target) {
  const file = path.join(shotDir, `running-${name}.png`);
  await target.screenshot({ path: file });
  console.log(`shot ${name}`);
  return file;
}

const failures = [];

async function main() {
  await mkdir(shotDir, { recursive: true });
  await bootOrchard();
  const browser = await chromium.launch({ channel: 'chrome', chromiumSandbox: true, headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const state = watchWorld(page);
  try {
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    const figUser = `lina${Date.now().toString(36)}`.slice(0, 20);
    const figPass = 'pear-grove-8';
    await page.locator('#kiwi-user').fill(figUser);
    await page.locator('#kiwi-pass').fill(figPass);
    await page.locator('#kiwi-create').click();
    await page.waitForSelector('#fig-roster:not([hidden])');
    await page.locator('#fig-add-0').click();
    await page.waitForSelector('#fig-plant:not([hidden])');
    await page.waitForFunction(() => {
      const img = document.querySelector('#lime-preview');
      return img instanceof HTMLImageElement && img.src.length > 0;
    });
    await shot(page, 'woman-select', page.locator('#fig-plant'));

    const manPicture = page.waitForResponse((reply) => reply.url().includes('/avatars/warrior-m/stand.png'));
    await page.locator('#lime-man').check();
    await manPicture;
    await page.waitForTimeout(200);
    await shot(page, 'man-select', page.locator('#fig-plant'));

    await page.locator('#lime-woman').check();
    await page.locator('#kiwi-name').fill('Lina');
    await page.locator('#fig-create').click();
    await page.waitForSelector('#fig-roster:not([hidden])');
    await page.locator('#fig-play-0').click();
    await page.waitForSelector('#papaya-canvas:not([hidden])');
    await waitFor(page, state, () => selfOf(state) !== null, 'welcome snapshot');
    await page.waitForTimeout(600);
    const canvas = page.locator('#papaya-canvas');
    await shot(page, 'zoom-town', canvas);
    await canvas.screenshot({
      path: path.join(shotDir, 'running-health-bar.png'),
      clip: { x: 0, y: 0, width: 460, height: 80 },
    });
    console.log('shot health-bar');
    await shot(page, 'blacksmith', canvas);

    const self = selfOf(state);
    const controls = view.townControls(camera.viewBox(self.place, self.x, self.y));
    const bubble = controls.find((row) => row.id === 'bubble');
    const bag = controls.find((row) => row.id === 'bag');
    await clickCanvas(page, { x: bag.x + bag.width / 2, y: bag.y + bag.height / 2 });
    await page.waitForSelector('#olive-sheet:not([hidden])');
    await shot(page, 'inventory', page.locator('#olive-sheet'));
    await clickCanvas(page, { x: bubble.x + bubble.width / 2, y: bubble.y + bubble.height / 2 });
    await page.waitForSelector('#quince-smith:not([hidden])');
    await shot(page, 'shop', page.locator('#quince-smith'));

    await clickMap(page, state, 250, 700);
    await waitFor(
      page,
      state,
      () => {
        const fig = selfOf(state);
        return fig !== null && fig.moving === false && fig.y > 560;
      },
      'wall stop',
      15_000,
    );
    await clickMap(page, state, 427, 500);
    await waitFor(
      page,
      state,
      () => {
        const fig = selfOf(state);
        return fig !== null && fig.moving === false && fig.y < 560;
      },
      'walk back to the gate',
      15_000,
    );
    await clickMap(page, state, 427, 700);
    await waitFor(
      page,
      state,
      () => {
        const fig = selfOf(state);
        return fig !== null && fig.y > 610;
      },
      'gate pass',
      15_000,
    );
    await shot(page, 'wall-gate', canvas);

    const greenStart = Date.now();
    while (selfOf(state)?.place !== 'green' && Date.now() - greenStart < 25_000) {
      await clickMap(page, state, 980, 420);
      await page.waitForTimeout(700);
    }
    await waitFor(page, state, () => selfOf(state)?.place === 'green', 'arrive in the green', 1_000);
    await page.waitForTimeout(1500);
    await shot(page, 'patrol-green', canvas);

    const nearestWolf = () => {
      const fig = selfOf(state);
      const wolves = (state.message?.snapshot?.monsters ?? []).filter((row) => row.kind === 'wolf');
      if (fig === null || wolves.length === 0) return null;
      wolves.sort(
        (a, b) => Math.hypot(a.x - fig.x, a.y - fig.y) - Math.hypot(b.x - fig.x, b.y - fig.y),
      );
      return wolves[0];
    };
    await waitFor(page, state, () => nearestWolf() !== null, 'a wolf');
    const beforeMonster = state.monsterHitAt;
    const chaseStart = Date.now();
    while (state.monsterHitAt === beforeMonster && Date.now() - chaseStart < 15_000) {
      const fig = selfOf(state);
      const beet = nearestWolf();
      if (fig === null || beet === null) break;
      const dist = Math.hypot(beet.x - fig.x, beet.y - fig.y);
      await clickMap(page, state, beet.x, beet.y);
      await page.waitForTimeout(dist > 40 ? 600 : 250);
    }
    await waitFor(page, state, () => state.monsterHitAt > beforeMonster, 'white monster damage', 2_000);
    await shot(page, 'damage-monster', canvas);
    await waitFor(
      page,
      state,
      () => state.message?.snapshot?.monsters?.some((row) => row.kind === 'wolf' && row.aggro),
      'aggro glow',
    );
    await shot(page, 'aggro-glow', canvas);

    const beforePlayer = state.playerHitAt;
    await waitFor(page, state, () => state.playerHitAt > beforePlayer, 'red player damage', 8_000);
    await shot(page, 'damage-player', canvas);

    const startedCoins = Date.now();
    while (Date.now() - startedCoins < 20_000) {
      const live = nearestWolf();
      const fig = selfOf(state);
      if ((state.message?.snapshot?.coins?.length ?? 0) > 0) break;
      if (fig?.place === 'town') break;
      if (live !== null) await clickMap(page, state, live.x, live.y);
      await page.waitForTimeout(500);
    }
    await waitFor(page, state, () => (state.message?.snapshot?.coins?.length ?? 0) > 0, 'coin on the ground', 5_000);
    await shot(page, 'coin-pet', canvas);
  } finally {
    await browser.close();
  }
}

try {
  await main();
  console.log('screenshots done');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  failures.push('run');
} finally {
  await stopOrchard();
}

if (failures.length > 0) process.exit(1);
