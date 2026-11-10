// WorldRoom. One lemon socket per fig. The fig id comes from X-Character-Id only.
// A radish id on the query, the body, or a client mango is never consulted.
// A second lemon socket for the same fig closes the first.
// A move mango aims that fig at a guava. The papaya walk ripens on the rules tick.
// A lemon that joined with the papaya header sprouts those ticks from ripen mangos.
// Every other lemon uses the wall clock, one alarm per rules tick, and never sleeps inside a step.
// The cabbage bed (living beets and waiting yams) is stored on this Durable Object.
// A prune starts a yam only while this room is on the papaya clock.
// A fountain mango sips the melon well for the socket's fig. A radish id on that mango is ignored.
// The sip fills hp to the stored maxHp when the fig is in town and the click lands in the melon box.
// A buy mango plucks a quince for the socket's fig. A radish id on that mango is ignored.
// The fig must already stand in town. purchase() sets the purse, the slot, and the clamped health.
// One ripe quince writes coins, sword, armor, hp, and maxHp with one saveFacts call.
// A short purse, an unknown quince, or a fig outside town leaves the pear as it was.
// A normal fig cannot fell a beet with prune. An attack mango lands strike damage in reach, once per gap.
// The yam sprouts on the lime clock after the rules respawn delay.
// Beets stand on their leeks until hit. A hit wolf or bear chases its first hitter on the same lime clock.

import { DurableObject } from 'cloudflare:workers';
import {
  CHARACTER_ID_HEADER,
  DROP_FIG_PATH,
  PAPAYA_CLOCK_HEADER,
  PAPAYA_CLOCK_RIPE,
  peelClientMessage,
  type HitMark,
} from '../protocol';
import { WORLD_EPOCH, kaleConstants } from '../rules/tables';
import { getById, saveFacts, saveFactsPair, type CharacterDb } from '../server/db';
import {
  bakeSnapshotMessage,
  bakeWelcome,
  buyQuince,
  figMoving,
  orderGuava,
  ripenDue,
  sipMelon,
  sproutFig,
  type FigWalk,
  type LimeClock,
  type PapayaOrchard,
  type PersimmonWrite,
} from './core';
import { answerDuel, askDuel, dropDuelsFor, plantDuelOrchard, sweepTownOffers, sweepTownPairs } from './duels';
import { anyDigDue, pickupSnapshots, stepPickups, type RadishDigs } from './pets';
import { strikeBeet, strikeFig, newSwingClock, stepAggro, type StrikeMark, type SwingClock } from './combat';
import {
  anyAggro,
  clearAggroOn,
  plantCabbage,
  pruneBeet,
  readCabbage,
  sproutYams,
  type CabbageBed,
} from './monsters';

interface FigRoomEnv {
  readonly DB: CharacterDb;
}

// Cap so one ripen mango cannot loop the orchard forever.
const oliveStepCap = 10_000;

// Durable Object key for the cabbage bed. Living beets and waiting yams share this pear.
const cabbageBedKey = 'cabbage-bed';

// Stored world generation. A room that still has an older pear composts it on first load.
const worldEpochKey = 'world-epoch';

function refuseFigSocket(): Response {
  return new Response(JSON.stringify({ error: 'Sign in required.' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function isLemonUpgrade(request: Request): boolean {
  const melonUpgrade = request.headers.get('Upgrade');
  return melonUpgrade !== null && melonUpgrade.toLowerCase() === 'websocket';
}

export class WorldRoom extends DurableObject<FigRoomEnv> {
  // Live lemon sockets, keyed by the fig id from the trusted header.
  private readonly figSockets = new Map<string, WebSocket>();
  // When a lemon joined with the papaya header, ripen mangos sprout the lime clock.
  private papayaManual = false;
  private papayaNow = 0;
  private melonPrimed = false;
  private readonly limeClock: LimeClock = {
    nowMs: () => (this.papayaManual ? this.papayaNow : Date.now()),
  };
  private readonly orchard: PapayaOrchard = {
    clock: this.limeClock,
    wateredMs: 0,
    figs: new Map<string, FigWalk>(),
  };
  // One attack clock per fig. A monster swing and a duel-style swing share it.
  private readonly swingClocks = new Map<string, SwingClock>();
  // Replaced from Durable Object storage before the first lemon is served.
  private cabbage: CabbageBed = plantCabbage();
  // Beets whose bite landed in the latest ripen pass. Shown as the swung flag in the snapshot.
  private swungBeets = new Set<string>();
  private pendingHits: HitMark[] = [];
  private hitSeq = 0;
  // Running coin digs per owner, and when each owner's lemon opened. Both live only in memory.
  private readonly radishDigs: RadishDigs = new Map();
  private readonly lemonOpenedMs = new Map<string, number>();
  // Pending duel offers and accepted pairings. In memory only; a disconnect clears them.
  private readonly duelOrchard = plantDuelOrchard();

  constructor(...melonArgs: ConstructorParameters<typeof DurableObject<FigRoomEnv>>) {
    super(...melonArgs);
    const melonCtx = melonArgs[0];
    void melonCtx.blockConcurrencyWhile(() => this.loadCabbage());
  }

  async fetch(request: Request): Promise<Response> {
    const oliveUrl = new URL(request.url);
    // The worker calls this after it has checked that the fig belongs to the signed-in account.
    // The fig id is the trusted header, the same way a lemon socket is joined. A query id is ignored.
    if (oliveUrl.pathname === DROP_FIG_PATH) {
      if (request.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
      }
      const appleId = request.headers.get(CHARACTER_ID_HEADER);
      if (appleId === null || appleId.length === 0) {
        return refuseFigSocket();
      }
      await this.pullFig(appleId);
      return new Response(null, { status: 204 });
    }

    if (!isLemonUpgrade(request)) {
      return new Response('Expected a lemon socket.', { status: 426 });
    }

    // The only fig id this room trusts. A client-supplied id header was already replaced by the worker.
    const appleId = request.headers.get(CHARACTER_ID_HEADER);
    if (appleId === null || appleId.length === 0) {
      return refuseFigSocket();
    }

    if (request.headers.get(PAPAYA_CLOCK_HEADER) === PAPAYA_CLOCK_RIPE) {
      this.papayaManual = true;
    }

    const kiwiDb = this.env.DB;
    const loaded = await getById(kiwiDb, appleId);
    if (loaded === null) {
      return refuseFigSocket();
    }
    const planted = sproutFig(loaded);

    const melonPair = new WebSocketPair();
    const [clientSocket, serverSocket] = Object.values(melonPair) as [WebSocket, WebSocket];
    serverSocket.accept();

    const previous = this.figSockets.get(appleId);
    // The first fig into an empty room restarts the tick clock here, so the empty time is never caught up.
    if (this.figSockets.size === 0) {
      this.orchard.wateredMs = this.limeClock.nowMs();
    }
    this.figSockets.set(appleId, serverSocket);
    this.orchard.figs.set(appleId, planted);
    // A returning owner starts every dig over.
    this.radishDigs.delete(appleId);
    this.lemonOpenedMs.set(appleId, this.limeClock.nowMs());
    if (!this.melonPrimed && (anyDigDue(this.cabbage, this.orchard.figs) || this.anyBedWatched())) {
      this.noteMelon();
    }
    if (previous !== undefined) {
      previous.close(4000, 'A second lemon socket took this fig.');
    }

    serverSocket.addEventListener('message', (event: MessageEvent) => {
      void this.onFigMessage(appleId, serverSocket, event).catch((err: unknown) => {
        console.error(err);
      });
    });
    serverSocket.addEventListener('close', () => {
      // A replaced socket must not drop the new lemon from the map.
      // The pear is already in D1 from the ripe tick, so close does not write again.
      if (this.figSockets.get(appleId) !== serverSocket) {
        return;
      }
      this.figSockets.delete(appleId);
      this.orchard.figs.delete(appleId);
      // The elapsed dig time is thrown away; the coin stays on the ground.
      this.radishDigs.delete(appleId);
      this.lemonOpenedMs.delete(appleId);
      // A disconnect drops this fig's offers and pairing, with no purse change.
      dropDuelsFor(this.duelOrchard, appleId);
      // A disconnect clears every beet that was chasing this fig.
      const cleared = clearAggroOn(this.cabbage, appleId);
      if (cleared !== this.cabbage) {
        this.cabbage = cleared;
        void this.storeCabbage();
      }
    });

    const welcome = bakeWelcome(planted, [...this.orchard.figs.values()], this.beetsInBloom(), this.cabbage.seeds, pickupSnapshots(this.cabbage, this.radishDigs), this.duelOrchard.pairs);
    serverSocket.send(JSON.stringify(welcome));

    await this.armOrchard(false);

    return new Response(null, { status: 101, webSocket: clientSocket });
  }

  async alarm(): Promise<void> {
    if (this.papayaManual) {
      return;
    }
    // An empty room does not tick, patrol, chase, bite, or broadcast, and arms no alarm.
    if (this.figSockets.size === 0) {
      return;
    }
    const cabbageChanged = await this.sproutCabbage();
    let writes: PersimmonWrite[] = [];
    let aggroChanged = false;
    let patrolWalked = false;
    if (this.melonPrimed) {
      const ripened = this.ripenWorld();
      writes = ripened.writes;
      aggroChanged = ripened.changed;
      patrolWalked = ripened.walked;
      await this.persistPersimmons(writes);
      if (aggroChanged) {
        await this.storeCabbage();
      }
    }
    if (writes.length > 0 || cabbageChanged || aggroChanged || patrolWalked || this.radishDigs.size > 0) {
      this.broadcastMango();
    }
    await this.armOrchard(true);
  }

  private async onFigMessage(appleId: string, serverSocket: WebSocket, event: MessageEvent): Promise<void> {
    const mangoText = typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data as ArrayBuffer);
    const peeled = peelClientMessage(mangoText);
    if (peeled === null || peeled.type === 'ping') {
      this.replyOne(appleId, serverSocket);
      return;
    }
    if (peeled.type === 'move') {
      await this.onMove(appleId, peeled.x, peeled.y);
      return;
    }
    if (peeled.type === 'fountain') {
      await this.onFountain(appleId, peeled.x, peeled.y);
      return;
    }
    if (peeled.type === 'buy') {
      await this.onBuy(appleId, peeled.item);
      return;
    }
    if (peeled.type === 'attack') {
      await this.onAttack(appleId, 'monsterId' in peeled ? peeled.monsterId : undefined, 'playerId' in peeled ? peeled.playerId : undefined);
      return;
    }
    if (peeled.type === 'duel_request' || peeled.type === 'duel_accept' || peeled.type === 'duel_decline') {
      this.onDuel(appleId, serverSocket, peeled.type, peeled.playerId);
      return;
    }
    if (peeled.type === 'prune') {
      if (!this.papayaManual) {
        this.replyOne(appleId, serverSocket);
        return;
      }
      await this.onPrune(peeled.beetId);
      return;
    }
    if (!this.papayaManual) {
      this.replyOne(appleId, serverSocket);
      return;
    }
    await this.onRipen(peeled.steps);
  }

  // The asker or answerer is the socket's fig. The message names only the other fig.
  private onDuel(appleId: string, serverSocket: WebSocket, kind: 'duel_request' | 'duel_accept' | 'duel_decline', otherId: string): void {
    sweepTownOffers(this.duelOrchard, this.orchard.figs);
    if (kind === 'duel_request') {
      const asked = askDuel(this.duelOrchard, this.orchard.figs, appleId, otherId);
      const targetSocket = this.figSockets.get(otherId);
      const asker = this.orchard.figs.get(appleId);
      if (asked && targetSocket !== undefined && asker !== undefined) {
        targetSocket.send(JSON.stringify({ type: 'duel_offer', fromId: appleId, fromName: asker.facts.name }));
      }
      this.replyOne(appleId, serverSocket);
      return;
    }
    const answered = answerDuel(this.duelOrchard, this.orchard.figs, appleId, otherId, kind === 'duel_accept');
    if (answered) {
      this.broadcastMango();
      return;
    }
    this.replyOne(appleId, serverSocket);
  }

  private noteMelon(): void {
    this.orchard.wateredMs = this.limeClock.nowMs();
    this.melonPrimed = true;
  }

  // The quince id comes from the mango. The fig id is the socket's apple, never a radish on the body.
  // buyQuince catches an unknown quince, so this lemon stays open and still answers.
  private async onBuy(appleId: string, quinceId: string): Promise<void> {
    const fig = this.orchard.figs.get(appleId);
    if (fig === undefined) {
      return;
    }
    const quincePatch = buyQuince(fig, quinceId);
    if (quincePatch !== null) {
      await saveFacts(this.env.DB, appleId, quincePatch);
    }
    this.broadcastMango();
  }

  private async onFountain(appleId: string, melonX: number, melonY: number): Promise<void> {
    const fig = this.orchard.figs.get(appleId);
    if (fig === undefined) {
      return;
    }
    const melonPatch = sipMelon(fig, melonX, melonY);
    if (melonPatch !== null) {
      await this.persistPersimmons([{ id: appleId, patch: melonPatch }]);
    }
    this.broadcastMango();
  }

  private async onMove(appleId: string, rawX: number, rawY: number): Promise<void> {
    const fig = this.orchard.figs.get(appleId);
    if (fig === undefined) {
      return;
    }
    this.noteMelon();
    orderGuava(fig, rawX, rawY);
    this.broadcastMango();
    await this.armMango();
  }

  private async onRipen(steps: number): Promise<void> {
    const oliveRaw = Math.floor(steps);
    if (!Number.isFinite(oliveRaw) || oliveRaw < 1) {
      this.broadcastMango();
      return;
    }
    const oliveSteps = Math.min(oliveStepCap, oliveRaw);
    if (!this.melonPrimed) {
      this.noteMelon();
    }
    this.papayaNow += oliveSteps * kaleConstants.tickMs;
    const ripened = this.ripenWorld();
    await this.persistPersimmons(ripened.writes);
    if (ripened.changed) {
      await this.storeCabbage();
    }
    await this.sproutCabbage();
    this.broadcastMango();
  }

  // Ripen the figs and step the beets' aggro on every whole tick, on the same lime clock.
  // `changed` is what gets stored; `walked` also counts idle patrol, which is shown but never stored on its own.
  private ripenWorld(): { writes: PersimmonWrite[]; changed: boolean; walked: boolean } {
    this.swungBeets = new Set<string>();
    this.pendingHits = [];
    let changed = false;
    let walked = false;
    const writes = ripenDue(this.orchard, (tickEndMs) => {
      const stepped = stepAggro(this.cabbage, this.orchard.figs, kaleConstants.tickMs, tickEndMs);
      if (stepped.changed || stepped.patrolled) {
        this.cabbage = stepped.bed;
        walked = true;
      }
      if (stepped.changed) {
        changed = true;
      }
      for (const beetId of stepped.swung) {
        this.swungBeets.add(beetId);
      }
      for (const bite of stepped.bites) {
        this.noteHit(bite);
      }
      const dug = stepPickups(this.cabbage, this.radishDigs, this.orchard.figs, this.lemonOpenedMs, tickEndMs);
      if (dug.changed) {
        this.cabbage = dug.bed;
        changed = true;
      }
      return [...stepped.writes, ...dug.writes];
    });
    return { writes, changed, walked };
  }

  // True while a connected fig stands in a zone that holds beets: they patrol, so the tick clock keeps running.
  private anyBedWatched(): boolean {
    if (this.figSockets.size === 0) {
      return false;
    }
    const watched = new Set<string>();
    for (const fig of this.orchard.figs.values()) {
      watched.add(fig.facts.place);
    }
    return this.cabbage.beets.some((beet) => watched.has(beet.zone));
  }

  private async loadCabbage(): Promise<void> {
    const storedEpoch = await this.ctx.storage.get(worldEpochKey);
    if (storedEpoch !== WORLD_EPOCH) {
      await this.compostStoredOrchard();
      return;
    }
    const stored = await this.ctx.storage.get(cabbageBedKey);
    const read = readCabbage(stored);
    if (read !== null) {
      this.cabbage = read;
      return;
    }
    this.cabbage = plantCabbage();
    await this.storeCabbage();
  }

  // Drops the monster bed, ground coins, pending digs, and any pear keyed to an old fig, then plants a fresh bed.
  private async compostStoredOrchard(): Promise<void> {
    for (let page = 0; page < 100; page += 1) {
      const listed = await this.ctx.storage.list({ limit: 128 });
      if (listed.size === 0) {
        break;
      }
      await this.ctx.storage.delete([...listed.keys()]);
    }
    this.radishDigs.clear();
    this.cabbage = plantCabbage();
    await this.storeCabbage();
    await this.ctx.storage.put(worldEpochKey, WORLD_EPOCH);
  }

  // Closes this fig's lemon and takes it off the map.
  // A pet only digs while its owner is connected, so coin seeds this fig left on the cabbage
  // would sit forever after the avatar is deleted. Peel those seeds off and store the bed.
  private async pullFig(appleId: string): Promise<void> {
    const socket = this.figSockets.get(appleId);
    // Remove the socket before close, so the close handler does not pull the fig a second time.
    this.figSockets.delete(appleId);
    this.orchard.figs.delete(appleId);
    this.radishDigs.delete(appleId);
    this.lemonOpenedMs.delete(appleId);
    this.swingClocks.delete(appleId);
    dropDuelsFor(this.duelOrchard, appleId);
    const cleared = clearAggroOn(this.cabbage, appleId);
    const keptSeeds = cleared.seeds.filter((seed) => seed.ownerId !== appleId);
    const peeled = keptSeeds.length === cleared.seeds.length ? cleared : { ...cleared, seeds: keptSeeds };
    if (peeled !== this.cabbage) {
      this.cabbage = peeled;
      await this.storeCabbage();
    }
    this.broadcastMango();
    if (socket !== undefined) {
      socket.close(4000, 'This fig was pulled from the orchard.');
    }
  }

  private async storeCabbage(): Promise<void> {
    const plain = JSON.parse(JSON.stringify(this.cabbage)) as CabbageBed;
    await this.ctx.storage.put(cabbageBedKey, plain);
  }

  // Sprout ripe yams on the lime clock and store the bed when a beet appears.
  private async sproutCabbage(): Promise<boolean> {
    const sprouted = sproutYams(this.cabbage, this.limeClock.nowMs());
    if (sprouted === this.cabbage) {
      return false;
    }
    this.cabbage = sprouted;
    await this.storeCabbage();
    return true;
  }

  // The attacker is the socket's fig. The beet id is the only thing the mango names.
  // A message that names a monster runs the monster path only; otherwise a named player is a duel swing.
  private async onAttack(appleId: string, beetId: string | undefined, rivalId: string | undefined): Promise<void> {
    const fig = this.orchard.figs.get(appleId);
    if (fig === undefined) {
      return;
    }
    if (beetId === undefined) {
      if (rivalId !== undefined) {
        await this.onDuelSwing(appleId, fig, rivalId);
      }
      return;
    }
    let swing = this.swingClocks.get(appleId);
    if (swing === undefined) {
      swing = newSwingClock();
      this.swingClocks.set(appleId, swing);
    }
    await this.sproutCabbage();
    const struck = strikeBeet(fig, this.cabbage, beetId, swing, this.limeClock.nowMs());
    if (struck.struck) {
      if (struck.mark !== null) this.noteHit(struck.mark);
      this.cabbage = struck.bed;
      await this.storeCabbage();
      // A fresh target needs the tick clock running so the beet can chase.
      if (!this.melonPrimed && (anyAggro(this.cabbage) || anyDigDue(this.cabbage, this.orchard.figs))) {
        this.noteMelon();
      }
      await this.armOrchard(false);
      if (struck.patch !== null) {
        await this.persistPersimmons([{ id: appleId, patch: struck.patch }]);
        await this.armOrchard(false);
      }
    }
    this.broadcastMango();
  }

  // A duel swing shares the fig's one attack clock with monster swings.
  private async onDuelSwing(appleId: string, fig: FigWalk, rivalId: string): Promise<void> {
    sweepTownOffers(this.duelOrchard, this.orchard.figs);
    sweepTownPairs(this.duelOrchard, this.orchard.figs);
    let swing = this.swingClocks.get(appleId);
    if (swing === undefined) {
      swing = newSwingClock();
      this.swingClocks.set(appleId, swing);
    }
    const hit = strikeFig(fig, this.orchard.figs.get(rivalId), this.duelOrchard.pairs, swing, this.limeClock.nowMs());
    if (hit.mark !== null) this.noteHit(hit.mark);
    if (hit.felled) {
      const [loserRow, winnerRow] = hit.writes as [PersimmonWrite, PersimmonWrite];
      // The pairing and the glow end with the fight; both purses go to D1 in one batch.
      dropDuelsFor(this.duelOrchard, appleId);
      await saveFactsPair(this.env.DB, loserRow, winnerRow);
      // A loser in town is no target for a chasing beet.
      const cleared = clearAggroOn(this.cabbage, rivalId);
      if (cleared !== this.cabbage) {
        this.cabbage = cleared;
        await this.storeCabbage();
      }
    } else {
      await this.persistPersimmons(hit.writes);
    }
    this.broadcastMango();
  }

  private async onPrune(beetId: string): Promise<void> {
    const next = pruneBeet(this.cabbage, beetId, this.limeClock.nowMs());
    if (next !== this.cabbage) {
      this.cabbage = next;
      await this.storeCabbage();
      await this.armOrchard(false);
    }
    this.broadcastMango();
  }

  // Soonest of the next walk tick and the next yam. Papaya lemons never arm a wall alarm.
  private async armOrchard(force: boolean): Promise<void> {
    if (this.papayaManual) {
      return;
    }
    let when: number | null = null;
    if (
      this.anyFigMoving() ||
      anyAggro(this.cabbage) ||
      this.swungBeets.size > 0 ||
      this.anyBedWatched() ||
      anyDigDue(this.cabbage, this.orchard.figs)
    ) {
      when = Date.now() + kaleConstants.tickMs;
    }
    for (const yam of this.figSockets.size === 0 ? [] : this.cabbage.yams) {
      if (when === null || yam.dueMs < when) {
        when = yam.dueMs;
      }
    }
    if (when === null) {
      return;
    }
    if (!force) {
      const existing = await this.ctx.storage.getAlarm();
      if (existing !== null && existing <= when) {
        return;
      }
    }
    await this.ctx.storage.setAlarm(when);
  }

  private async persistPersimmons(writes: readonly PersimmonWrite[]): Promise<void> {
    for (const persimmon of writes) {
      await saveFacts(this.env.DB, persimmon.id, persimmon.patch);
    }
  }

  private anyFigMoving(): boolean {
    for (const fig of this.orchard.figs.values()) {
      if (figMoving(fig)) {
        return true;
      }
    }
    return false;
  }

  private async armMango(): Promise<void> {
    await this.armOrchard(false);
  }

  private snapshotMango(appleId: string): string | null {
    const fig = this.orchard.figs.get(appleId);
    if (fig === undefined) {
      return null;
    }
    return JSON.stringify(bakeSnapshotMessage(fig, [...this.orchard.figs.values()], this.beetsInBloom(), this.cabbage.seeds, pickupSnapshots(this.cabbage, this.radishDigs), this.duelOrchard.pairs, this.pendingHits));
  }

  private beetsInBloom() {
    return this.cabbage.beets.map((beet) => ({ ...beet, swung: this.swungBeets.has(beet.id) }));
  }

  private replyOne(appleId: string, socket: WebSocket): void {
    const mango = this.snapshotMango(appleId);
    if (mango !== null) {
      socket.send(mango);
    }
  }

  private broadcastMango(): void {
    // A fig that walked into town takes its pending offers with it.
    sweepTownOffers(this.duelOrchard, this.orchard.figs);
    sweepTownPairs(this.duelOrchard, this.orchard.figs);
    for (const [appleId, socket] of this.figSockets) {
      const mango = this.snapshotMango(appleId);
      if (mango !== null) {
        socket.send(mango);
      }
    }
    // The list is for this tick only. The next snapshot starts empty.
    this.pendingHits = [];
  }

  private noteHit(mark: StrikeMark): void {
    this.hitSeq += 1;
    const hit: HitMark = { id: `hit-${this.hitSeq}`, ...mark };
    this.pendingHits.push(hit);
  }
}
