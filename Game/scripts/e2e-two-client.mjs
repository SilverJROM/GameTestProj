// G6 scripted two-client run: starts wrangler dev on a free port, drives two lemon clients
// over HTTP and WebSocket with no human, and stops wrangler before it exits.
// Every socket joins on the papaya clock, so time only passes when a ripen mango is sent.
// Nothing naps for combat, walking, or the coin pickup: each second is a batch of ripen ticks.

import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import * as esbuild from 'esbuild';

const gameDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const wranglerBin = path.join(gameDir, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
// The rules table is TypeScript with no imports; bundle it in memory so the numbers stay in one home.
const tableBundle = await esbuild.build({
  entryPoints: [path.join(gameDir, 'src', 'rules', 'tables.ts')],
  bundle: true,
  format: 'esm',
  write: false,
  logLevel: 'silent',
});
const { kaleConstants, pearTimings } = await import(
  `data:text/javascript;base64,${Buffer.from(tableBundle.outputFiles[0].text).toString('base64')}`
);
const guavaSecret = 'e2e-two-client-session-secret';
const cookieName = 'cp_session';
const bootDeadlineMs = 180_000;
const replyDeadlineMs = 15_000;

// Ticks per player swing gap (rounded up), per coin pickup, and enough to cross the whole map.
const swingTicks = Math.ceil((pearTimings.playerAttackGapSeconds * 1000) / kaleConstants.tickMs);
const dripTicks = (pearTimings.coinPickupSeconds * 1000) / kaleConstants.tickMs;
const walkTicks = Math.ceil((2_000 / kaleConstants.walkSpeedPxPerSec) * (1000 / kaleConstants.tickMs));

let checkCount = 0;
function check(condition, label) {
  checkCount += 1;
  if (!condition) {
    throw new Error(`check failed: ${label}`);
  }
  console.log(`ok ${checkCount} - ${label}`);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

// ---- wrangler dev lifecycle ----

let orchardDir = '';
let wranglerProc = null;
let wranglerLog = '';

function wranglerEnv() {
  return { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false', NO_COLOR: '1' };
}

async function bootOrchard(port) {
  orchardDir = await mkdtemp(path.join(tmpdir(), 'fig-e2e-'));
  const migrated = spawnSync(
    process.execPath,
    [wranglerBin, 'd1', 'migrations', 'apply', 'game-db', '--local', '--persist-to', orchardDir],
    { cwd: gameDir, env: wranglerEnv(), encoding: 'utf8' },
  );
  if (migrated.status !== 0) {
    throw new Error(`d1 migrations failed:\n${migrated.stdout}\n${migrated.stderr}`);
  }
  // Own process group, so the workerd child dies with wrangler.
  wranglerProc = spawn(
    process.execPath,
    [
      wranglerBin, 'dev', '--local', '--ip', '127.0.0.1', '--port', String(port),
      '--persist-to', orchardDir, '--var', `SESSION_SECRET:${guavaSecret}`,
    ],
    { cwd: gameDir, env: wranglerEnv(), detached: true, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const keepLog = (chunk) => {
    wranglerLog = (wranglerLog + chunk.toString('utf8')).slice(-8_000);
  };
  wranglerProc.stdout.on('data', keepLog);
  wranglerProc.stderr.on('data', keepLog);
  let exited = false;
  wranglerProc.once('exit', () => {
    exited = true;
  });
  const started = Date.now();
  while (Date.now() - started < bootDeadlineMs) {
    if (exited) {
      throw new Error(`wrangler dev exited early:\n${wranglerLog}`);
    }
    try {
      const reply = await fetch(`http://127.0.0.1:${port}/`);
      if (reply.status === 200) {
        return;
      }
    } catch {
      // Not listening yet; the poll below is the only wait, and it is for boot, not for the game.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`wrangler dev did not answer in time:\n${wranglerLog}`);
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
      if (winner === 'gone') {
        break;
      }
    }
  }
  if (orchardDir !== '') {
    await rm(orchardDir, { recursive: true, force: true });
    orchardDir = '';
  }
}

// ---- lemon clients ----

function mangoText(data) {
  return Array.isArray(data) ? Buffer.concat(data).toString('utf8') : Buffer.from(data).toString('utf8');
}

async function logIn(base, name, gender) {
  const reply = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, gender }),
  });
  const text = await reply.text();
  if (reply.status !== 200) {
    throw new Error(`login ${name} -> ${reply.status} ${text}`);
  }
  const beet = (reply.headers.getSetCookie()[0] ?? '').split(';')[0].trim();
  return { facts: JSON.parse(text), beet };
}

// Opens a papaya-clock socket with the given cookie pair and logs every message it hears.
function joinFig(base, beet) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${base.replace('http', 'ws')}/ws`, {
      headers: { Cookie: beet, 'X-Papaya-Clock': 'ripe' },
    });
    const fig = { socket, heard: [], snaps: [], welcome: null };
    const timer = setTimeout(() => {
      socket.terminate();
      reject(new Error('welcome timed out'));
    }, replyDeadlineMs);
    socket.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    socket.once('unexpected-response', (_req, res) => {
      clearTimeout(timer);
      reject(Object.assign(new Error(`socket refused with ${res.statusCode}`), { status: res.statusCode }));
    });
    socket.on('message', (data) => {
      const mango = JSON.parse(mangoText(data));
      if (fig.welcome === null && mango.type === 'welcome') {
        fig.welcome = mango;
        clearTimeout(timer);
        resolve(fig);
        return;
      }
      fig.heard.push(mango);
      if (mango.type === 'snapshot') {
        fig.snaps.push(mango);
      }
    });
  });
}

// Figs whose sockets are open. A broadcast reaches all of them, a ping or an offer only its sender.
// Every message waits for every snapshot it will cause, so no stale snapshot is mistaken for a reply.
let basket = [];
const replyOnly = new Set(['ping', 'duel_request']);

function waitCount(fig, target) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      fig.socket.off('message', look);
      reject(new Error('snapshot timed out'));
    }, replyDeadlineMs);
    function look() {
      if (fig.snaps.length > target) {
        clearTimeout(timer);
        fig.socket.off('message', look);
        resolve(fig.snaps[target]);
      }
    }
    fig.socket.on('message', look);
    look();
  });
}

// Sends one message and resolves with the sender's snapshot for it.
async function ask(fig, payload) {
  const hearers = replyOnly.has(payload.type) ? [fig] : basket;
  const targets = hearers.map((hearer) => [hearer, hearer.snaps.length]);
  const waits = targets.map(([hearer, target]) => waitCount(hearer, target));
  fig.socket.send(JSON.stringify(payload));
  const answers = await Promise.all(waits);
  return answers[hearers.indexOf(fig)];
}

const ripen = (fig, steps) => ask(fig, { type: 'ripen', steps });
const offersHeard = (fig) => fig.heard.filter((row) => row.type === 'duel_offer');
const partnersIn = (snap) => Object.fromEntries(snap.snapshot.players.map((row) => [row.id, row.duelPartnerId]));
const playerIn = (snap, id) => snap.snapshot.players.find((row) => row.id === id);

// Walk a fig to a point; the snapshot comes back once it stands there.
async function walkTo(fig, x, y) {
  await ask(fig, { type: 'move', x, y });
  return ripen(fig, walkTicks);
}

// Both figs see nobody glowing.
async function nobodyGlows(...figs) {
  for (const fig of figs) {
    const snap = await ask(fig, { type: 'ping' });
    check(Object.values(partnersIn(snap)).every((partner) => partner === null), 'nobody glows');
  }
}

// ---- the run ----

async function run(base) {
  // 1. The page, the client script, and the map picture.
  const page = await fetch(`${base}/`);
  const pageText = await page.text();
  check(page.status === 200 && (page.headers.get('content-type') ?? '').includes('text/html'), 'GET / is html');
  check(/<script/i.test(pageText), 'the page has a script tag');
  const script = await fetch(`${base}/client.js`);
  const scriptText = await script.text();
  check(script.status === 200 && /javascript/.test(script.headers.get('content-type') ?? ''), 'GET /client.js is javascript');
  check(scriptText.length > 0, 'client.js is not empty');
  const map = await fetch(`${base}/maps/world-map-wide.jpg`);
  const mapBytes = new Uint8Array(await map.arrayBuffer());
  check(map.status === 200 && (map.headers.get('content-type') ?? '').includes('image/jpeg'), 'GET map is a jpeg');
  check(mapBytes[0] === 0xff && mapBytes[1] === 0xd8, 'the map starts with the jpeg marker');

  // 2. Both log in with different names and join on the papaya clock.
  const aLogin = await logIn(base, 'Apricot', 'woman');
  const bLogin = await logIn(base, 'Basil', 'man');
  check(aLogin.facts.id !== bLogin.facts.id && aLogin.facts.name !== bLogin.facts.name, 'two names, two characters');
  let apricot = await joinFig(base, aLogin.beet);
  const basil = await joinFig(base, bLogin.beet);
  basket = [apricot, basil];
  const aId = aLogin.facts.id;
  const bId = bLogin.facts.id;
  check(apricot.welcome.character.id === aId && basil.welcome.character.id === bId, 'each socket binds its own character');
  const startPurse = { a: apricot.welcome.character.coins, b: basil.welcome.character.coins };

  // 3. A walks toward a wolf in the green and B sees A's new position.
  const wolves = apricot.welcome.snapshot.monsters.filter((beet) => beet.kind === 'wolf');
  check(wolves.length > 0, 'the green has wolves');
  const wolf = wolves[0];
  const before = playerIn(await ask(basil, { type: 'ping' }), aId);
  await ask(apricot, { type: 'move', x: wolf.x, y: wolf.y });
  const midway = await ripen(apricot, 5);
  const seenMidway = playerIn(await ask(basil, { type: 'ping' }), aId);
  check(
    seenMidway.x === midway.character.x && seenMidway.y === midway.character.y &&
      (seenMidway.x !== before.x || seenMidway.y !== before.y),
    "B sees A's new position",
  );
  const arrived = await ripen(apricot, walkTicks);
  check(arrived.character.place === 'green', 'A stands in the green');
  check(Math.hypot(arrived.character.x - wolf.x, arrived.character.y - wolf.y) <= kaleConstants.meleeReachPx, 'A is in reach of the wolf');
  const bAfterA = await walkTo(basil, wolf.x, wolf.y);
  check(bAfterA.character.place === 'green', `B stands in the green (${JSON.stringify([bAfterA.character.place, bAfterA.character.x, bAfterA.character.y, wolf.x, wolf.y])})`);

  // 4. A kills the wolf. The coins drop at once but reach the purse one per pickup duration.
  let wolfHp = wolf.hp;
  let kill = null;
  for (let hit = 0; hit < 60 && kill === null; hit += 1) {
    await ripen(apricot, swingTicks);
    const snap = await ask(apricot, { type: 'attack', monsterId: wolf.id });
    if (!snap.snapshot.monsters.some((beet) => beet.id === wolf.id)) {
      kill = snap;
    } else {
      wolfHp = snap.snapshot.monsters.find((beet) => beet.id === wolf.id).hp;
    }
  }
  check(kill !== null, `A killed the wolf (last hp ${wolfHp})`);
  const dropped = kill.snapshot.coins.filter((seed) => seed.ownerId === aId);
  check(dropped.length > 0, 'the wolf dropped coins owned by A');
  check(kill.character.coins === startPurse.a, 'no coin reached the purse at the kill');
  for (let paid = 1; paid <= dropped.length; paid += 1) {
    const early = await ripen(apricot, dripTicks - 1);
    check(early.character.coins === startPurse.a + paid - 1, `before pickup ${paid} the purse is unchanged`);
    const onTime = await ripen(apricot, 1);
    check(onTime.character.coins === startPurse.a + paid, `pickup ${paid} paid exactly one coin`);
    const bView = await ask(basil, { type: 'ping' });
    check(bView.character.coins === startPurse.b, "B's purse did not gain A's coins");
  }
  const coinsWon = dropped.length;
  const aPurse = startPurse.a + coinsWon;
  const bAfterPickup = await ripen(basil, dripTicks * 2);
  check(bAfterPickup.character.coins === startPurse.b, "B's purse stays put after the pickups");

  // 5. A new socket with A's cookie restores A's character; a forged cookie is refused.
  const restored = await joinFig(base, aLogin.beet);
  apricot.socket.close();
  apricot = restored;
  basket = [apricot, basil];
  check(restored.welcome.character.id === aId, 'the reload restores A');
  check(restored.welcome.character.coins === aPurse, 'the reload keeps the purse');
  check(restored.welcome.character.place === 'green', 'the reload keeps the place');
  check(
    Math.hypot(restored.welcome.character.x - arrived.character.x, restored.welcome.character.y - arrived.character.y) < 1,
    'the reload keeps x and y',
  );
  const meReply = await fetch(`${base}/api/me`, { headers: { Cookie: aLogin.beet } });
  check(meReply.status === 200 && (await meReply.json()).id === aId, '/api/me returns A with the cookie');
  const tampered = `${aLogin.beet.slice(0, -1)}${aLogin.beet.endsWith('A') ? 'B' : 'A'}`;
  for (const forged of [tampered, `${cookieName}=forged.${'0'.repeat(64)}`, `${cookieName}=${bId}`]) {
    const refusedMe = await fetch(`${base}/api/me`, { headers: { Cookie: forged } });
    check(refusedMe.status === 401, '/api/me refuses a forged cookie');
    const refusedSocket = await joinFig(base, forged).then(
      (fig) => {
        fig.socket.close();
        return null;
      },
      (err) => err,
    );
    check(refusedSocket !== null && refusedSocket.status === 401, 'the socket refuses a forged cookie');
  }

  // 6. A duel: declined with no purse change, then accepted, then settled.
  const aBefore = (await ask(apricot, { type: 'ping' })).character;
  const bBefore = (await ask(basil, { type: 'ping' })).character;
  await ask(basil, { type: 'duel_request', playerId: aId });
  await ask(apricot, { type: 'ping' });
  check(offersHeard(apricot).length === 1 && offersHeard(apricot)[0].fromId === bId, 'A hears the duel offer from B');
  await ask(apricot, { type: 'duel_decline', playerId: bId });
  await nobodyGlows(apricot, basil);
  const aDeclined = (await ask(apricot, { type: 'ping' })).character;
  const bDeclined = (await ask(basil, { type: 'ping' })).character;
  check(aDeclined.coins === aBefore.coins && bDeclined.coins === bBefore.coins, 'a decline moves no coins');

  await ask(basil, { type: 'duel_request', playerId: aId });
  await ask(apricot, { type: 'ping' });
  check(offersHeard(apricot).length === 2, 'A hears the second offer');
  await ask(apricot, { type: 'duel_accept', playerId: bId });
  for (const fig of [apricot, basil]) {
    const partners = partnersIn(await ask(fig, { type: 'ping' }));
    check(partners[aId] === bId && partners[bId] === aId, 'the accepted duel glows on both');
  }

  // B swings on the rules gap until A is down at 0 and sent back to town.
  let settled = null;
  for (let swing = 0; swing < 80 && settled === null; swing += 1) {
    await ripen(basil, swingTicks);
    await ask(basil, { type: 'attack', playerId: aId });
    const aNow = (await ask(apricot, { type: 'ping' })).character;
    if (aNow.place === 'town') {
      settled = aNow;
    }
  }
  check(settled !== null, 'the loser returned to town');
  const payout = Math.floor(aBefore.coins / 2);
  check(payout > 0, `the loser held enough coins to pay (${aBefore.coins})`);
  check(settled.coins === aBefore.coins - payout, 'the loser paid half rounded down');
  check(settled.hp === settled.maxHp, 'the loser is back at full health');
  const bSettled = (await ask(basil, { type: 'ping' })).character;
  check(bSettled.coins === bBefore.coins + payout, 'the winner gained half the loser coins rounded down');
  check(bSettled.place === 'green', 'the winner stays in the green');
  await nobodyGlows(apricot, basil);
}

// ---- main ----

let exitCode = 1;
const stopOnSignal = (signal) => () => {
  stopOrchard().finally(() => process.exit(signal === 'SIGINT' ? 130 : 143));
};
process.once('SIGINT', stopOnSignal('SIGINT'));
process.once('SIGTERM', stopOnSignal('SIGTERM'));

try {
  const port = await freePort();
  await bootOrchard(port);
  console.log(`wrangler dev answers on port ${port}`);
  await run(`http://127.0.0.1:${port}`);
  console.log(`all ${checkCount} checks passed`);
  exitCode = 0;
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
} finally {
  await stopOrchard();
  console.log('wrangler dev stopped');
}
process.exit(exitCode);
