// Plays one duel between the two avatars of the local test account (Duelist beats Victim) over the real websocket.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('/home/candidate/ProjA/Game/package.json');
const WebSocket = require('ws');
const creds = Object.fromEntries(readFileSync('/home/candidate/ProjA/Game/docs/plan04-tools/test-account.local.txt', 'utf8').split('\n').filter((l) => l.includes(': ')).map((l) => l.split(': ')));
const base = 'http://127.0.0.1:8787';
function cookies(res) { return res.headers.getSetCookie().map((c) => c.split(';')[0]); }
const si = await fetch(`${base}/api/signin`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: creds.username, password: creds.password }) });
const account = cookies(si);
const list = await (await fetch(`${base}/api/avatars`, { headers: { cookie: account.join('; ') } })).json();
const byName = Object.fromEntries(list.map((a) => [a.name, a]));
async function enter(name) {
  const res = await fetch(`${base}/api/play`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: account.join('; ') }, body: JSON.stringify({ id: byName[name].id }) });
  const jar = [...account, ...cookies(res)].join('; ');
  const ws = new WebSocket('ws://127.0.0.1:8787/ws', { headers: { cookie: jar } });
  const log = [];
  ws.on('message', (d) => { try { log.push(JSON.parse(d.toString())); } catch {} });
  await new Promise((r) => ws.once('open', r));
  return { ws, log, id: byName[name].id };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const duelist = await enter('Duelist');
const victim = await enter('Victim');
await sleep(800);
duelist.ws.send(JSON.stringify({ type: 'duel_request', playerId: victim.id }));
await sleep(500);
victim.ws.send(JSON.stringify({ type: 'duel_accept', playerId: duelist.id }));
await sleep(500);
for (let i = 0; i < 20; i += 1) {
  duelist.ws.send(JSON.stringify({ type: 'attack', playerId: victim.id }));
  await sleep(500);
}
const last = (l) => [...l].reverse().find((m) => m.character);
console.log('victim heard', [...new Set(victim.log.map((m) => m.type))].join(','), 'duelist heard', [...new Set(duelist.log.map((m) => m.type))].join(','));
console.log('duelist players', JSON.stringify(last(duelist.log)?.snapshot?.players?.map((p) => [p.id.slice(0, 4), p.place, Math.round(p.x), Math.round(p.y), p.duel ?? p.redGlow])));
console.log('duelist coins', last(duelist.log)?.character.coins, 'victim coins', last(victim.log)?.character.coins, 'victim place', last(victim.log)?.character.place);
duelist.ws.close(); victim.ws.close();
