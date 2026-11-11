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
  const view = await b.page.evaluate(() => ({ w: document.querySelector('#papaya-canvas').getBoundingClientRect().width }));
  const dx = pos(b.st, dyer.id).x - pos(b.st, slayer.id).x, dy = pos(b.st, dyer.id).y - pos(b.st, slayer.id).y;
  const scale = view.w / 576; // the default window is 576 map px wide (324 tall)
  const cx = box.x + box.width / 2 + dx * scale, cy = box.y + box.height / 2 + dy * scale;
  const bodyY = cy - 24 * scale; // the middle of Dyer's body, well above the feet
  const hp = async () => (await call('GET', '/api/avatars')).find((x) => x.name === 'Dyer');
  // 1. A LEFT click on the other player only walks: no menu, no offer.
  await b.page.mouse.click(cx, bodyY);
  await sleep(700);
  console.log('after left click: menu visible', await b.page.locator('#duel-menu').isVisible(), '| offer panel on Dyer', await a.page.locator('#plum-offer').isVisible().catch(() => false));
  // 2. A RIGHT click on the body (not the feet) opens the little menu.
  const here = pos(b.st, slayer.id);
  const view2 = { dx: pos(b.st, dyer.id).x - here.x, dy: pos(b.st, dyer.id).y - here.y };
  const cx2 = box.x + box.width / 2 + view2.dx * scale, cy2 = box.y + box.height / 2 + view2.dy * scale - 24 * scale;
  await b.page.mouse.click(cx2, cy2, { button: 'right' });
  await sleep(400);
  console.log('right click on the body: menu visible', await b.page.locator('#duel-menu').isVisible(), '| text:', (await b.page.locator('#duel-menu-name').innerText()).trim());
  await b.page.screenshot({ path: out + '/duel-menu.png' });
  // 3. Pick Duel: the request goes out, three dots show over the target, the target gets the offer.
  await b.page.locator('#duel-menu-duel').click();
  await sleep(900);
  console.log('after Duel: menu hidden', !(await b.page.locator('#duel-menu').isVisible()), '| Dyer sees the offer', await a.page.locator('#plum-offer button', { hasText: /Accept/ }).isVisible().catch(() => false));
  await b.page.screenshot({ path: out + '/duel-dots.png' });
  // 4. The asker cancels from the menu: the target's offer closes. Then ask again and accept.
  await b.page.mouse.click(cx2, cy2, { button: 'right' });
  await sleep(300);
  console.log('menu while waiting says:', (await b.page.locator('#duel-menu-name').innerText()).trim(), '| cancel button:', (await b.page.locator('#duel-menu-cancel').innerText()).trim());
  await b.page.locator('#duel-menu-cancel').click();
  await sleep(700);
  console.log('after Cancel request: Dyer offer still visible', await a.page.locator('#plum-offer button', { hasText: /Accept/ }).isVisible().catch(() => false));
  await b.page.mouse.click(cx2, cy2, { button: 'right' });
  await sleep(300);
  await b.page.locator('#duel-menu-duel').click();
  await sleep(800);
  await a.page.locator('#plum-accept').click();
  await sleep(900);
  await b.page.screenshot({ path: out + '/duel-accepted.png' });
  // 5. Once paired: hover shows the white outline on the partner; a LEFT click walks over and swings ONCE; a RIGHT click
  //    walks over and swings until dead.
  const hpOf = (p) => { const me = p.st.msg.snapshot?.players?.find((q) => q.id === p.st.msg.character.id); return me?.duelHp ?? p.st.msg.character.hp; }; // the duel bar while paired, else real health
  const before = hpOf(a);
  const here2 = pos(b.st, slayer.id);
  const cx3 = box.x + box.width / 2 + (pos(b.st, dyer.id).x - here2.x) * scale, cy3 = box.y + box.height / 2 + (pos(b.st, dyer.id).y - here2.y) * scale - 24 * scale;
  await b.page.mouse.move(cx3, cy3);
  await sleep(500);
  await b.page.screenshot({ path: out + '/duel-hover-outline.png' });
  console.log('cursor over the partner:', await b.page.evaluate(() => document.querySelector('#papaya-canvas').style.cursor));
  await b.page.mouse.click(cx3, cy3);
  await sleep(3500);
  const afterOne = hpOf(a);
  await sleep(2500);
  const afterWait = hpOf(a);
  console.log('Dyer hp before', before, 'after one left click', afterOne, 'later', afterWait, '(one swing only when equal and lower than before)');
  const here3 = pos(b.st, slayer.id);
  const cx4 = box.x + box.width / 2 + (pos(b.st, dyer.id).x - here3.x) * scale, cy4 = box.y + box.height / 2 + (pos(b.st, dyer.id).y - here3.y) * scale - 24 * scale;
  await b.page.mouse.click(cx4, cy4, { button: 'right' });
  const trail = [];
  for (let i = 0; i < 14; i += 1) { await sleep(1000); trail.push(hpOf(a)); }
  console.log('Dyer hp each second after the right click:', trail.join(','));
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
  const rowAfter = (await call('GET', '/api/avatars')).find((x) => x.name === 'Dyer');
  console.log('Dyer after respawn (from the account list):', JSON.stringify(rowAfter).slice(0, 160));
} catch (e) { console.error('ERROR', e.message); } finally { await browser.close(); }
