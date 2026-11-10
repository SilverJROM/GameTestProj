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
const reg = await bundle(`${gameDir}/src/rules/regions.ts`);

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
  const pairs = [
    ['inside right of gate -> outside south', [455, 552], [430, 650]],
    ['inside left part of opening -> outside', [405, 580], [385, 640]],
    ['inside far -> outside far (needs routing)', [330, 520], [440, 660]],
    ['inside above gate -> outside right of gate', [470, 545], [520, 640]],
    ['outside -> back inside', [430, 640], [440, 540]],
    ['cemetery side: inside town -> cemetery road', [340, 262], [345, 190]],
  ];
  let n = 0;
  for (const [label, a, b] of pairs) {
    n++;
    const { page, st } = await makePlayer('Gate_' + n, 'Gater' + n, `place='town', x=${a[0]}, y=${a[1]}`);
    const s0 = self(st); const v = camera.viewBox(s0.place, s0.x, s0.y);
    await clickCanvas(page, camera.mapToCanvas(v, b[0], b[1]));
    let last = null, still = 0, frames = [];
    for (let t = 0; t < 120; t++) { await sleep(100); const s = self(st); frames.push([s.x, s.y]); if (last && Math.hypot(s.x-last[0], s.y-last[1]) < 0.01) { if (++still > 8) break; } else still = 0; last = [s.x, s.y]; }
    const f = frames[frames.length - 1]; const err = Math.hypot(f[0]-b[0], f[1]-b[1]);
    let maxJump = 0; for (let i = 1; i < frames.length; i++) maxJump = Math.max(maxJump, Math.hypot(frames[i][0]-frames[i-1][0], frames[i][1]-frames[i-1][1]));
    console.log((err < 15 ? 'PASS' : 'FAIL'), label.padEnd(44), 'start', a, 'target', b, 'ended', f.map(Math.round), 'miss', Math.round(err), 'px, max step', maxJump.toFixed(1), 'px/100ms');
    await page.context().close();
  }
} catch (e) { console.error('ERROR', e); } finally { if (browser) await browser.close(); await stop(); }
