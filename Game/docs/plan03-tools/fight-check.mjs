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
  const kinds = [['wolf', "place='green', x=800, y=460"], ['bear', "place='grey', x=1000, y=60"]];
  let n = 0;
  for (const [kind, where] of kinds) {
    n++;
    const { page, st } = await makePlayer('Fight_' + n, 'Fighter' + n, `coins=0, hp=140, max_hp=140, level=6, ${where}`);
    const me0 = self(st);
    const targets = st.msg.snapshot.monsters.filter((m) => m.kind === kind).sort((a, b) => Math.hypot(a.x-me0.x, a.y-me0.y) - Math.hypot(b.x-me0.x, b.y-me0.y));
    const t = targets[0]; const dist0 = Math.hypot(t.x - me0.x, t.y - me0.y);
    const rect = view.beetSpriteRect(t.x, t.y, t.kind);
    const v = camera.viewBox(me0.place, me0.x, me0.y);
    const head = camera.mapToCanvas(v, rect.x + rect.width / 2, rect.y + rect.height * 0.15);
    console.log(kind, 'start distance', Math.round(dist0), 'px; clicking its HEAD at map', Math.round(rect.x + rect.width/2), Math.round(rect.y + rect.height*0.15), '(feet at', Math.round(t.x), Math.round(t.y) + ')');
    const xp0 = st.msg.character.xp; const t0 = Date.now(); let minGap = dist0;
    await clickCanvas(page, head);
    while (Date.now() - t0 < 40000) { await sleep(200); const me = self(st); const w = st.msg.snapshot.monsters.find((m) => m.id === t.id); if (w) minGap = Math.min(minGap, Math.hypot(w.x-me.x, w.y-me.y)); if (!w || st.msg.character.xp > xp0) break; }
    const alive = st.msg.snapshot.monsters.some((m) => m.id === t.id);
    console.log(' ->', alive ? 'FAIL target still alive' : 'PASS target killed', 'in', ((Date.now()-t0)/1000).toFixed(1), 's; closest approach', Math.round(minGap), 'px; xp', xp0, '->', st.msg.character.xp);
    await page.screenshot({ path: out + '/fight-' + kind + '.png' });
    await page.context().close();
  }
} catch (e) { console.error('ERROR', e); } finally { if (browser) await browser.close(); await stop(); }
