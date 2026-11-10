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
  // helper: account + avatar through the API, then a browser context holding the cookies
  async function makePlayer(user, avatar, extraSql) {
    const jar = {}; const grab = (res) => { for (const h of res.headers.getSetCookie()) { const [kv] = h.split(';'); const i = kv.indexOf('='); jar[kv.slice(0, i)] = kv.slice(i + 1); } };
    const call = async (m, p, b) => { const r = await fetch(base + p, { method: m, headers: { 'content-type': 'application/json', cookie: Object.entries(jar).map(([k, v]) => k + '=' + v).join('; ') }, body: b ? JSON.stringify(b) : undefined }); grab(r); return r.json().catch(() => null); };
    await call('POST', '/api/account', { username: user, password: 'password123' });
    const av = await call('POST', '/api/avatars', { name: avatar, gender: 'woman' });
    sql(`UPDATE characters SET ${extraSql} WHERE id='${av.id}'`);
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addCookies(Object.entries(jar).map(([name, value]) => ({ name, value, url: base })));
    const page = await ctx.newPage();
    const st = { msg: null };
    page.on('websocket', (ws) => ws.on('framereceived', (f) => { try { const m = JSON.parse(typeof f.payload === 'string' ? f.payload : Buffer.from(f.payload).toString()); if (m?.type === 'welcome' || m?.type === 'snapshot') st.msg = m; } catch {} }));
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /^play$/i }).first().click();
    await page.waitForSelector('#papaya-canvas:not([hidden])'); while (!st.msg) await sleep(100); await sleep(500);
    return { page, st };
  }
  const self = (st) => st.msg.snapshot.players.find((p) => p.id === st.msg.character.id);
  async function clickCanvas(page, p) { const b = await page.locator('#papaya-canvas').boundingBox(); await page.mouse.click(b.x + (p.x * b.width) / 1280, b.y + (p.y * b.height) / 720); }
  const c = (st) => { const x = st.msg.character; return JSON.stringify({ coins: x.coins, sword: x.sword, armor: x.armor, hp: x.hp, maxHp: x.maxHp, items: x.items }); };
  const bagText = (page) => page.evaluate(() => document.querySelector('#olive-sheet').innerText.replace(/\n+/g, ' | '));
  const now = Date.now(); const DAY = 86400000;
  const { page, st } = await makePlayer('Expiry_1', 'Hoarder', "coins=19, place='town', x=300, y=440");
  const id = st.msg.character.id;
  page.on('console', () => {});
  console.log('joined with purse', st.msg.character.coins, 'expiry', JSON.stringify(st.msg.character.coinExpiry));
  await page.close();
  sql(`DELETE FROM coin_lots WHERE character_id='${id}'; INSERT INTO coin_lots (id, character_id, amount, picked_at) VALUES ('l1','${id}',9,${now - 8*DAY}), ('l2','${id}',6,${now - 2*DAY}), ('l3','${id}',4,${now - 1*DAY}); UPDATE characters SET coins=19 WHERE id='${id}'`);
  const ctx = (await page.context());
  const page2 = await ctx.newPage(); const st2 = { msg: null };
  page2.on('websocket', (ws) => ws.on('framereceived', (f) => { try { const m = JSON.parse(typeof f.payload === 'string' ? f.payload : Buffer.from(f.payload).toString()); if (m?.type === 'welcome' || m?.type === 'snapshot') st2.msg = m; } catch {} }));
  await page2.goto(base, { waitUntil: 'domcontentloaded' });
  await page2.getByRole('button', { name: /^play$/i }).first().click();
  await page2.waitForSelector('#papaya-canvas:not([hidden])'); while (!st2.msg) await sleep(100); await sleep(600);
  console.log('after rejoin: purse', st2.msg.character.coins, '(9 old coins gone, expected 10); oldest alive:', JSON.stringify(st2.msg.character.coinExpiry), 'in days', ((st2.msg.character.coinExpiry.atMs - Date.now())/DAY).toFixed(2));
  async function clickCanvas2(pg, p) { const b = await pg.locator('#papaya-canvas').boundingBox(); await pg.mouse.click(b.x + (p.x * b.width) / 1280, b.y + (p.y * b.height) / 720); }
  await clickCanvas2(page2, { x: 1210, y: 46 }); await sleep(600);
  console.log('bag text:', await page2.evaluate(() => document.querySelector('#olive-coins').innerText + ' | ' + document.querySelector('#olive-expiry').innerText));
  await page2.screenshot({ path: out + '/coin-expiry-bag.png' });
} catch (e) { console.error('ERROR', e); } finally { if (browser) await browser.close(); await stop(); }
