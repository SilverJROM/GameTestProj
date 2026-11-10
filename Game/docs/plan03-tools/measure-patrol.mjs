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
    page.on('websocket', (ws) => ws.on('framereceived', (f) => { try { const m = JSON.parse(typeof f.payload === 'string' ? f.payload : Buffer.from(f.payload).toString()); if (m?.type === 'welcome' || m?.type === 'snapshot') { st.msg = m; (st.log ||= []).push({ t: Date.now(), mons: m.snapshot.monsters.map(q => [q.id, q.zone ?? q.place, q.x, q.y, q.kind]) }); } } catch {} }));
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /^play$/i }).first().click();
    await page.waitForSelector('#papaya-canvas:not([hidden])'); while (!st.msg) await sleep(100); await sleep(500);
    return { page, st };
  }
  const self = (st) => st.msg.snapshot.players.find((p) => p.id === st.msg.character.id);
  async function clickCanvas(page, p) { const b = await page.locator('#papaya-canvas').boundingBox(); await page.mouse.click(b.x + (p.x * b.width) / 1280, b.y + (p.y * b.height) / 720); }
  const c = (st) => { const x = st.msg.character; return JSON.stringify({ coins: x.coins, sword: x.sword, armor: x.armor, hp: x.hp, maxHp: x.maxHp, items: x.items }); };
  const bagText = (page) => page.evaluate(() => document.querySelector('#olive-sheet').innerText.replace(/\n+/g, ' | '));
  const { page, st } = await makePlayer('Meas_1', 'Watcher', "coins=0, hp=70, max_hp=70, place='green', x=800, y=330");
  await sleep(12000);
  const first = st.log[0].mons, last = st.log[st.log.length - 1].mons;
  const v = camera.viewBox('green', 800, 330);
  const rows = last.map((m) => { const f = first.find((q) => q[0] === m[0]); const moved = f ? Math.hypot(m[2]-f[2], m[3]-f[3]) : 0;
    const vis = m[2] >= v.x && m[2] <= v.x + v.width && m[3] >= v.y && m[3] <= v.y + v.height; return { id: m[0], kind: m[4], zone: m[1], x: Math.round(m[2]), y: Math.round(m[3]), movedPx: Math.round(moved), onScreen: vis }; });
  console.log('view box', JSON.stringify({ x: Math.round(v.x), y: Math.round(v.y), w: Math.round(v.width), h: Math.round(v.height) }), '(player in green at 800,330, 12 s)');
  const visible = rows.filter((r) => r.onScreen);
  console.log('monsters on screen:', visible.length, ' of which moved >2 px:', visible.filter((r) => r.movedPx > 2).length);
  for (const r of visible) console.log(' ', r.kind.padEnd(9), r.zone.padEnd(6), `(${r.x},${r.y})`, 'moved', r.movedPx, 'px');
  // overlap: nearest-neighbour distance between same-zone monsters
  const nn = rows.map((a) => Math.min(...rows.filter((b) => b.id !== a.id && b.zone === a.zone).map((b) => Math.hypot(a.x-b.x, a.y-b.y)))).filter(Number.isFinite);
  console.log('closest same-zone neighbours (px), smallest 5:', nn.sort((a,b)=>a-b).slice(0,5).map(Math.round).join(', '));
} catch (e) { console.error('ERROR', e); } finally { if (browser) await browser.close(); await stop(); }
