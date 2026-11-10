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
  const jar = {}; const grab = (res) => { for (const h of res.headers.getSetCookie()) { const [kv] = h.split(';'); const i = kv.indexOf('='); jar[kv.slice(0, i)] = kv.slice(i + 1); } };
  const call = async (m, p, b, extra = {}) => { const r = await fetch(base + p, { method: m, headers: { 'content-type': 'application/json', cookie: Object.entries({ ...jar, ...extra }).map(([k, v]) => k + '=' + v).join('; ') }, body: b ? JSON.stringify(b) : undefined }); grab(r); return r.json().catch(() => null); };
  await call('POST', '/api/account', { username: 'Shared_1', password: 'password123' });
  const accountCookie = { cp_account: jar.cp_account };
  const avA = await call('POST', '/api/avatars', { name: 'Ayla', gender: 'woman' });
  const avB = await call('POST', '/api/avatars', { name: 'Boran', gender: 'man' });
  sql(`UPDATE characters SET coins=100, place='town', x=300, y=440 WHERE id IN ('${avA.id}','${avB.id}')`);
  async function open(avatar, nth = 0) {
    const j = { ...accountCookie };
    const r = await fetch(base + '/api/play', { method: 'POST', headers: { 'content-type': 'application/json', cookie: 'cp_account=' + j.cp_account }, body: JSON.stringify({ id: avatar.id }) });
    for (const h of r.headers.getSetCookie()) { const [kv] = h.split(';'); const i = kv.indexOf('='); j[kv.slice(0, i)] = kv.slice(i + 1); }
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addCookies(Object.entries(j).map(([name, value]) => ({ name, value, url: base })));
    const page = await ctx.newPage(); const st = { msg: null };
    page.on('websocket', (ws) => ws.on('framereceived', (f) => { try { const m = JSON.parse(typeof f.payload === 'string' ? f.payload : Buffer.from(f.payload).toString()); if (m?.type === 'welcome' || m?.type === 'snapshot') st.msg = m; } catch {} }));
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /^play$/i }).nth(nth).click();
    await page.waitForSelector('#papaya-canvas:not([hidden])'); while (!st.msg) await sleep(100); await sleep(500);
    return { page, st };
  }
  const c = (st) => JSON.stringify({ name: st.msg.character.name, sword: st.msg.character.sword, items: st.msg.character.items, elsewhere: st.msg.character.elsewhere });
  async function clickCanvas(page, p) { const b = await page.locator('#papaya-canvas').boundingBox(); await page.mouse.click(b.x + (p.x * b.width) / 1280, b.y + (p.y * b.height) / 720); }
  const A = await open(avA);
  // buy Short sword (first Buy button) in the shop
  const vA = camera.viewBox('town', 300, 440); const bubble = view.townControls(vA).find((k) => k.id === 'bubble');
  await clickCanvas(A.page, { x: bubble.x + bubble.width / 2, y: bubble.y + bubble.height / 2 }); await A.page.waitForSelector('#quince-smith:not([hidden])');
  await A.page.locator('#quince-list button').first().click(); await sleep(800);
  log('A after buying :', c(A.st));
  await A.page.locator('#quince-close').click();
  // B (same account, a different avatar page) sees the sword in its bag and wears it by drag
  const B = await open(avB, 1);
  log('B joined       :', c(B.st));
  await clickCanvas(B.page, { x: 1210, y: 46 }); await sleep(500);
  await B.page.locator('#olive-items *', { hasText: 'Short sword' }).last().dragTo(B.page.locator('#olive-sword')); await sleep(900);
  log('B after drag   :', c(B.st));
  // A opens the bag: the sword must show as worn by Boran and not be usable
  await clickCanvas(A.page, { x: 1210, y: 46 }); await sleep(900);
  log('A sees         :', c(A.st));
  log('A bag text     :', (await A.page.evaluate(() => document.querySelector('#olive-items').innerText.replace(/\n+/g, ' | '))));
  await A.page.locator('#olive-items *', { hasText: 'Short sword' }).last().click({ force: true }).catch(() => {}); await sleep(700);
  log('A clicked tile :', c(A.st), '(sword must stay null)');
  await A.page.screenshot({ path: out + '/shared-bag-A.png' });
  // B takes it off, A can wear it
  await B.page.locator('#olive-sword').click(); await sleep(800);
  await sleep(500); await A.page.locator('#olive-items *', { hasText: 'Short sword' }).last().click().catch(() => {}); await sleep(900);
  log('B unequipped, A clicks tile:', c(A.st));
} catch (e) { console.error('ERROR', e); } finally { if (browser) await browser.close(); await stop(); }
