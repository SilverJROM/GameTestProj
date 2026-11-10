// Throwaway investigation: EXP, coins, and gear in the real running game. Not part of the project.
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const gameDir = '/home/candidate/ProjA/Game';
const { chromium } = await import(`${gameDir}/node_modules/playwright/index.mjs`);
const esbuild = await import(`${gameDir}/node_modules/esbuild/lib/main.js`);
const wranglerBin = path.join(gameDir, 'node_modules/wrangler/bin/wrangler.js');
const port = 8791;
const base = `http://127.0.0.1:${port}`;

async function bundle(file) {
  const out = await esbuild.build({ entryPoints: [file], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' });
  return import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`);
}
const camera = await bundle(`${gameDir}/src/client/camera.ts`);
const view = await bundle(`${gameDir}/src/client/view.ts`);

const dir = path.join(tmpdir(), `inv-${Date.now()}`);
await mkdir(dir, { recursive: true });
const env = { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false', NO_COLOR: '1' };
const mig = spawnSync(process.execPath, [wranglerBin, 'd1', 'migrations', 'apply', 'game-db', '--local', '--persist-to', dir], { cwd: gameDir, env, encoding: 'utf8' });
if (mig.status !== 0) throw new Error(mig.stdout + mig.stderr);
const proc = spawn(process.execPath, [wranglerBin, 'dev', '--local', '--ip', '127.0.0.1', '--port', String(port), '--persist-to', dir], { cwd: gameDir, env, detached: true, stdio: 'ignore' });

function sql(command) {
  const r = spawnSync(process.execPath, [wranglerBin, 'd1', 'execute', 'game-db', '--local', '--persist-to', dir, '--command', command], { cwd: gameDir, env, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stdout + r.stderr);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function stop() {
  for (const sig of ['SIGTERM', 'SIGKILL']) { try { process.kill(-proc.pid, sig); } catch {} await sleep(1500); }
  await rm(dir, { recursive: true, force: true });
}

const log = (...a) => console.log(...a);

let browser;
const out='/tmp/claude-1001/-home-candidate-ProjA/ef7e62e3-d1fb-4a2d-8a0e-2a743aa38f35/scratchpad';
try {
  const t0 = Date.now();
  while (Date.now() - t0 < 180000) { try { if ((await fetch(base)).status === 200) break; } catch {} await sleep(500); }
  browser = await chromium.launch({ channel: 'chrome', chromiumSandbox: true, headless: true });
  const results = []; const ok = (name, pass, detail = '') => { results.push(pass); console.log(pass ? 'PASS' : 'FAIL', name, detail); };
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage(); const st = { msg: null };
  page.on('websocket', (ws) => ws.on('framereceived', (f) => { try { const m = JSON.parse(typeof f.payload === 'string' ? f.payload : Buffer.from(f.payload).toString()); if (m?.type === 'welcome' || m?.type === 'snapshot') st.msg = m; } catch {} }));
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  const text = () => page.evaluate(() => document.body.innerText);
  // 1 sign-in errors
  await page.locator('input[type=text], input:not([type])').first().fill('Reg_User');
  await page.locator('input[type=password]').first().fill('short');
  await page.getByRole('button', { name: /create account/i }).click(); await sleep(600);
  ok('password under 8 characters refused with a message', /8|characters|short/i.test(await text()), JSON.stringify((await text()).slice(0, 120)));
  await page.locator('input[type=password]').first().fill('password123');
  await page.getByRole('button', { name: /^sign in$/i }).click(); await sleep(600);
  ok('wrong sign-in shows one generic message', /incorrect|invalid|not match|wrong|could not/i.test(await text()), JSON.stringify((await text()).slice(0, 140)));
  await page.locator('input[type=password]').first().fill('password123');
  await page.getByRole('button', { name: /create account/i }).click(); await sleep(800);
  ok('account created, avatar list shown', /your avatars/i.test(await text()));
  // 2 two avatars + cap + delete confirm
  for (const [name, i] of [['Ayla', 0], ['Boran', 1]]) {
    await page.getByRole('button', { name: /add avatar/i }).first().click(); await sleep(300);
    if (i === 1) await page.getByLabel(/man/i).first().check().catch(() => {});
    await page.locator('input[type=text], input:not([type])').last().fill(name);
    await page.getByRole('button', { name: /^create$/i }).click(); await sleep(700);
  }
  ok('two avatars listed and no third Add button', (await page.getByRole('button', { name: /add avatar/i }).count()) === 0 && /Ayla/.test(await text()) && /Boran/.test(await text()));
  await page.getByRole('button', { name: /^delete$/i }).nth(1).click(); await sleep(300);
  ok('delete asks for a second click', /click again to delete/i.test(await text()), '');
  await sleep(4600);
  ok('delete confirmation reverts by itself', (await page.getByRole('button', { name: /^delete$/i }).count()) === 2);
  // 3 play, HUD, zoom, panels
  await page.getByRole('button', { name: /^play$/i }).first().click();
  await page.waitForSelector('#papaya-canvas:not([hidden])'); while (!st.msg) await sleep(100); await sleep(700);
  ok('playing: zoom slider visible', await page.locator('#zoom-slider').isVisible());
  await page.locator('#zoom-slider').evaluate((el) => { el.value = String(el.max); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
  await sleep(300); await page.reload({ waitUntil: 'domcontentloaded' }); await sleep(800);
  await page.getByRole('button', { name: /^play$/i }).first().click().catch(() => {}); await page.waitForSelector('#papaya-canvas:not([hidden])'); await sleep(800);
  const zoomSaved = await page.evaluate(() => { try { return localStorage.getItem('game.zoom'); } catch { return null; } });
  ok('zoom setting is remembered', zoomSaved !== null, 'game.zoom=' + zoomSaved);
  async function clickCanvas(pt) { const b = await page.locator('#papaya-canvas').boundingBox(); await page.mouse.click(b.x + (pt.x * b.width) / 1280, b.y + (pt.y * b.height) / 720); }
  await clickCanvas({ x: 1210, y: 46 }); await sleep(500);
  ok('Bag opens', await page.locator('#olive-sheet').isVisible());
  await page.keyboard.press('Escape'); await sleep(300);
  ok('Esc closes the Bag', await page.locator('#olive-sheet').isHidden());
  await clickCanvas({ x: 1210, y: 46 }); await sleep(300); await page.locator('#olive-close').click(); await sleep(300);
  ok('Close button closes the Bag', await page.locator('#olive-sheet').isHidden());
  const hud = await page.evaluate(() => 'ok'); ok('HUD present in snapshot data', st.msg.character.level === 1 && st.msg.character.coins === 0);
  // blacksmith bubble: click it in town
  const camera = await bundle(`${gameDir}/src/client/camera.ts`); const view = await bundle(`${gameDir}/src/client/view.ts`);
  const me = st.msg.snapshot.players.find((p) => p.id === st.msg.character.id); const v = camera.viewBox(me.place, me.x, me.y);
  const bubble = view.townControls(v).find((k) => k.id === 'bubble'); await clickCanvas({ x: bubble.x + bubble.width / 2, y: bubble.y + bubble.height / 2 }); await sleep(500);
  ok('blacksmith bubble (three dots) opens the shop', await page.locator('#quince-smith').isVisible() && bubble.text === '...');
  await page.keyboard.press('Escape'); await sleep(300);
  ok('Esc closes the shop', await page.locator('#quince-smith').isHidden());
  // reload keeps session
  await page.reload({ waitUntil: 'domcontentloaded' }); await sleep(900);
  ok('reload keeps you signed in', /your avatars/i.test(await text()) || (await page.locator('#papaya-canvas').isVisible()));
  console.log(results.every(Boolean) ? 'ALL PASS' : 'SOME FAILED', results.filter(Boolean).length + '/' + results.length);
} catch (e) { console.error('ERROR', e); } finally { if (browser) await browser.close(); await stop(); }
