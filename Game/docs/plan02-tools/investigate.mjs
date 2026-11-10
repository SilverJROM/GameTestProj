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
try {
  const t0 = Date.now();
  while (Date.now() - t0 < 180000) { try { if ((await fetch(base)).status === 200) break; } catch {} await sleep(500); }

  browser = await chromium.launch({ channel: 'chrome', chromiumSandbox: true, headless: true });

  async function session(name, place, x, y, extraSql = '') {
    // create the row through the real login route, then move it with SQL before the page connects
    await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, gender: 'woman' }) });
    sql(`UPDATE characters SET place='${place}', x=${x}, y=${y} ${extraSql} WHERE name_key='${name.toLowerCase()}'`);
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const st = { msg: null, timeline: [], hits: [] };
    page.on('websocket', (ws) => ws.on('framereceived', (f) => {
      let m; try { m = JSON.parse(typeof f.payload === 'string' ? f.payload : Buffer.from(f.payload).toString()); } catch { return; }
      if (m?.type !== 'welcome' && m?.type !== 'snapshot') return;
      st.msg = m;
      const c = m.character;
      const last = st.timeline[st.timeline.length - 1];
      if (!last || last.xp !== c.xp || last.coins !== c.coins || last.level !== c.level || last.hp !== c.hp || last.maxHp !== c.maxHp || last.sword !== c.sword || last.armor !== c.armor) {
        st.timeline.push({ t: Date.now(), level: c.level, xp: c.xp, coins: c.coins, hp: c.hp, maxHp: c.maxHp, sword: c.sword, armor: c.armor });
      }
      for (const h of m.snapshot?.hits ?? []) st.hits.push({ t: Date.now(), kind: h.targetKind, amount: h.amount });
    }));
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.locator('#kiwi-name').fill(name);
    await page.locator('#apple-form button[type="submit"]').click();
    await page.waitForSelector('#papaya-canvas:not([hidden])');
    while (!st.msg) await sleep(100);
    return { page, st };
  }
  const self = (st) => st.msg.snapshot.players.find((p) => p.id === st.msg.character.id);
  async function clickCanvas(page, p) {
    const b = await page.locator('#papaya-canvas').boundingBox();
    await page.mouse.click(b.x + (p.x * b.width) / 1280, b.y + (p.y * b.height) / 720);
  }
  async function clickMap(page, st, mx, my) {
    const s = self(st); const v = camera.viewBox(s.place, s.x, s.y); const m = 4 / v.scale;
    const x = Math.min(Math.max(mx, v.x + m), v.x + v.width - m); const y = Math.min(Math.max(my, v.y + m), v.y + v.height - m);
    await clickCanvas(page, camera.mapToCanvas(v, x, y));
  }
  const bagText = (page) => page.evaluate(() => ({ coins: document.querySelector('#olive-coins')?.textContent, xp: document.querySelector('#olive-xp')?.textContent, level: document.querySelector('#olive-level')?.textContent, health: document.querySelector('#olive-health')?.textContent, strike: document.querySelector('#olive-strike')?.textContent, sword: document.querySelector('#olive-sword')?.textContent, armor: document.querySelector('#olive-armor')?.textContent, hidden: document.querySelector('#olive-sheet')?.hidden }));
  async function openBag(page, st) {
    const v = camera.viewBox(self(st).place, self(st).x, self(st).y);
    const bag = view.townControls(v).find((c) => c.id === 'bag');
    await clickCanvas(page, { x: bag.x + bag.width / 2, y: bag.y + bag.height / 2 });
  }
  async function killOneWolf(page, st, label) {
    const startKills = st.timeline.length;
    const startXp = st.msg.character.xp; const startLevel = st.msg.character.level;
    const t = Date.now();
    while (Date.now() - t < 60000) {
      const s = self(st);
      if (st.msg.character.xp !== startXp || st.msg.character.level !== startLevel) return true;
      const wolves = st.msg.snapshot.monsters.filter((m) => m.kind === 'wolf').sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y));
      if (!wolves.length) { await sleep(300); continue; }
      const w = wolves[0]; const d = Math.hypot(w.x - s.x, w.y - s.y);
      await clickMap(page, st, w.x, w.y);
      await sleep(d > 40 ? 600 : 250);
    }
    log(label, 'did not kill within 60s');
    return false;
  }

  // ---------- Phase A: level 1, no gear, in the green. Kill wolves, watch XP and coins. ----------
  log('=== Phase A: kill wolves in the green, level 1, no gear ===');
  const A = await session('Alpha', 'green', 800, 330, ', coins=0, xp=0, level=1');
  await openBag(A.page, A.st);              // open the bag BEFORE the kill
  await sleep(300);
  log('bag before kill :', JSON.stringify(await bagText(A.page)));
  log('ws before kill  :', JSON.stringify(A.st.msg.character));
  const killed1 = await killOneWolf(A.page, A.st, 'A1');
  const killT = Date.now();
  log('first kill      :', killed1);
  log('ws after kill   :', JSON.stringify({ level: A.st.msg.character.level, xp: A.st.msg.character.xp, coins: A.st.msg.character.coins }));
  log('bag (left open) :', JSON.stringify(await bagText(A.page)), '<- stale if it still shows the old numbers');
  await openBag(A.page, A.st);              // click Bag again
  await sleep(300);
  log('bag after click :', JSON.stringify(await bagText(A.page)));
  // watch the coins arrive
  const seen = [];
  const until = Date.now() + 22000;
  let lastCoins = A.st.msg.character.coins;
  while (Date.now() < until) {
    if (A.st.msg.character.coins !== lastCoins) { lastCoins = A.st.msg.character.coins; seen.push(`${((Date.now() - killT) / 1000).toFixed(1)}s -> ${lastCoins}`); }
    await sleep(100);
  }
  log('coins seen after kill (secs since kill -> purse):', seen.join(', ') || 'none in 22s');
  log('ground coin seeds left now:', A.st.msg.snapshot.coins.length, ' pickups running:', A.st.msg.snapshot.pickups.length);
  log('hit amounts on monsters (strike, no gear):', [...new Set(A.st.hits.filter((h) => h.kind === 'monster').map((h) => h.amount))].join(','));
  await openBag(A.page, A.st); await sleep(300);
  log('bag after coins :', JSON.stringify(await bagText(A.page)));
  await A.page.close();

  // ---------- Phase B: town, buy gear through the real shop UI ----------
  log('\n=== Phase B: buy gear in town (level 1, 100 coins, hp 40/70 to see how hp reacts) ===');
  const B = await session('Bravo', 'town', 300, 440, ', coins=200, xp=0, level=1, hp=40, max_hp=70');
  log('start           :', JSON.stringify({ lvl: B.st.msg.character.level, hp: B.st.msg.character.hp, maxHp: B.st.msg.character.maxHp, coins: B.st.msg.character.coins }));
  async function openShop() {
    const v = camera.viewBox(self(B.st).place, self(B.st).x, self(B.st).y);
    const bubble = view.townControls(v).find((c) => c.id === 'bubble');
    await clickCanvas(B.page, { x: bubble.x + bubble.width / 2, y: bubble.y + bubble.height / 2 });
    await B.page.waitForSelector('#quince-smith:not([hidden])');
    await sleep(200);
  }
  async function buy(label) {
    await openShop();
    const list = await B.page.locator('#quince-list button').allTextContents();
    const idx = list.findIndex((t) => t.startsWith(label));
    await B.page.locator('#quince-list button').nth(idx).click();
    await sleep(700);
    const c = B.st.msg.character;
    log(`bought ${label.padEnd(12)}:`, JSON.stringify({ coins: c.coins, sword: c.sword, armor: c.armor, hp: c.hp, maxHp: c.maxHp }));
    log('  shop purse text:', await B.page.evaluate(() => document.querySelector('#quince-purse')?.textContent));
  }
  await buy('Short sword');
  await buy('Leather');
  await openBag(B.page, B.st); await sleep(300);
  log('bag             :', JSON.stringify(await bagText(B.page)));
  await buy('Plate');
  await buy('Great sword');
  await openBag(B.page, B.st); await sleep(300);
  log('bag             :', JSON.stringify(await bagText(B.page)));
  await B.page.close();

  // ---------- Phase C: attack power really changes? green, great sword vs none ----------
  log('\n=== Phase C: damage numbers in the green, with sword and without ===');
  for (const [name, sword, armor] of [['Charlie', null, null], ['Delta', 'shortSword', null], ['Echo', 'greatSword', 'plate']]) {
    const sw = sword ? `'${sword}'` : 'NULL'; const ar = armor ? `'${armor}'` : 'NULL';
    const mh = armor === 'plate' ? 110 : 70;
    const C = await session(name, 'green', 800, 330, `, coins=0, xp=0, level=1, sword=${sw}, armor=${ar}, hp=${mh}, max_hp=${mh}`);
    await killOneWolf(C.page, C.st, name);
    const amounts = C.st.hits.filter((h) => h.kind === 'monster').map((h) => h.amount);
    const taken = C.st.hits.filter((h) => h.kind === 'player').map((h) => h.amount);
    log(`${name.padEnd(8)} sword=${sword} armor=${armor}: my hits ${JSON.stringify(amounts)}  wolf bites on me ${JSON.stringify(taken)}  maxHp ${C.st.msg.character.maxHp}`);
    await C.page.close();
  }
} catch (e) {
  console.error('ERROR', e);
} finally {
  if (browser) await browser.close();
  await stop();
}
