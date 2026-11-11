// Two avatars of the local test account fight a duel in real (headless) Chrome: the killed one gets the death panel and a
// cross, the winner does not get the panel; after Respawn the cross is gone. Used when the Chrome extension was offline.
import { readFileSync } from 'node:fs';
const { chromium } = await import('/home/candidate/ProjA/Game/node_modules/playwright/index.mjs');
const creds = Object.fromEntries(readFileSync('/home/candidate/ProjA/Game/docs/plan04-tools/test-account.local.txt', 'utf8').split('\n').filter((l) => l.includes(': ')).map((l) => l.split(': ')));
const base = 'http://127.0.0.1:8787';
const out = '/tmp/claude-1001/-home-candidate-ProjA/ef7e62e3-d1fb-4a2d-8a0e-2a743aa38f35/scratchpad';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jar = {};
const grab = (res) => { for (const h of res.headers.getSetCookie()) { const [kv] = h.split(';'); const i = kv.indexOf('='); jar[kv.slice(0, i)] = kv.slice(i + 1); } };
const call = async (m, p, b) => { const r = await fetch(base + p, { method: m, headers: { 'content-type': 'application/json', cookie: Object.entries(jar).map(([k, v]) => k + '=' + v).join('; ') }, body: b ? JSON.stringify(b) : undefined }); grab(r); return r.json().catch(() => null); };
await call('POST', '/api/signin', { username: creds.username, password: creds.password });
const list = await call('GET', '/api/avatars');
const dyer = list.find((a) => a.name === 'Dyer'), slayer = list.find((a) => a.name === 'Slayer');
const browser = await chromium.launch({ channel: 'chrome', chromiumSandbox: true, headless: true });
async function player(avatar) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const acct = { ...jar };
  await ctx.addCookies(Object.entries(acct).map(([name, value]) => ({ name, value, url: base })));
  const page = await ctx.newPage();
  const st = { msg: null };
  page.on('websocket', (ws) => ws.on('framereceived', (f) => { try { const m = JSON.parse(String(f.payload)); if (m?.type === 'snapshot' || m?.type === 'welcome') st.msg = m; } catch {} }));
  await page.goto(base);
  await page.evaluate(async (id) => { await fetch('/api/play', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }), credentials: 'same-origin' }); }, avatar.id);
  await page.goto(base);
  // roster is shown again; press Play on the right card via the API cookie already set: click the matching Play button
  await page.locator('#fig-roster button', { hasText: /^Play$/ }).nth(avatar.name === 'Dyer' ? 0 : 1).click();
  await page.waitForSelector('#papaya-canvas:not([hidden])');
  while (!st.msg) await sleep(100);
  await sleep(1500);
  return { page, st, ctx };
}
try {
  const a = await player(dyer);
  const b = await player(slayer);
  const pos = (st, id) => st.msg.snapshot.players.find((p) => p.id === id);
  console.log('Dyer', JSON.stringify(pos(b.st, dyer.id)).slice(0, 90), 'Slayer', JSON.stringify(pos(b.st, slayer.id)).slice(0, 90));
  // Slayer's canvas coordinates of Dyer: use the camera maths through the page's bounding box (map -> screen by the shown window).
  const box = await b.page.locator('#papaya-canvas').boundingBox();
  const feetToScreen = async (page, st, id) => {
    // The camera is centred on the local avatar; read the pixel scale from the canvas size and the 0.6 zone share.
    return null;
  };
  // Right-click Dyer's feet in Slayer's view: Dyer stands 60 map px left of Slayer; map scale = canvas width / view width.
  const view = await b.page.evaluate(() => ({ w: document.querySelector('#papaya-canvas').getBoundingClientRect().width }));
  const dx = pos(b.st, dyer.id).x - pos(b.st, slayer.id).x, dy = pos(b.st, dyer.id).y - pos(b.st, slayer.id).y;
  // viewBox width for the green zone at ZOOM_CLOSE is roughly 762 map px (measured in plan 03): scale = canvas / 762
  const scale = view.w / 762;
  const cx = box.x + box.width / 2 + dx * scale, cy = box.y + box.height / 2 + dy * scale;
  await b.page.mouse.click(cx, cy, { button: 'right' });
  await sleep(800);
  await a.page.locator('#plum-accept').click();
  await sleep(800);
  for (let i = 0; i < 4; i += 1) { await b.page.mouse.click(cx, cy - 14 * scale); await sleep(700); }
  await sleep(1200);
  const dead = await a.page.evaluate(() => !document.getElementById('death-panel').hidden);
  const winner = await b.page.evaluate(() => !document.getElementById('death-panel').hidden);
  console.log('killed player sees the death panel:', dead, '| winner sees it:', winner);
  await a.page.screenshot({ path: out + '/death-killed.png' });
  await b.page.screenshot({ path: out + '/death-winner.png' });
  await a.page.locator('#death-respawn').click();
  await sleep(2200);
  const after = await a.page.evaluate(() => !document.getElementById('death-panel').hidden);
  await a.page.screenshot({ path: out + '/death-respawned.png' });
  console.log('panel after respawn:', after);
} catch (e) { console.error('ERROR', e.message); } finally { await browser.close(); }
