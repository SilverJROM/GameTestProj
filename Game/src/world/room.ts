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
// A buy mango puts a quince in the socket's fig bag. A radish id on that mango is ignored.
// The fig must already stand in town. The purse and the new bag row commit in one batch.
// equip and unequip wear or stow that fig's own quince in any zone.
// One wear writes the slot, hp, and maxHp in one statement. An unowned quince is refused.
// A normal fig cannot fell a beet with prune. An attack mango lands strike damage in reach, once per gap.
// The yam sprouts on the lime clock after the rules respawn delay.
// A watched beet walks its radish. A hit wolf or bear chases its first hitter on the same lime clock.

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
import { nextExpiry } from '../rules/coins';
import { expireCoinLots, getById, listBag, listSiblingIds, readCoinLots, saveFacts, saveFactsPair, saveQuinceBuy, saveQuinceSlot, type CharacterDb, type CharacterFactsPatch } from '../server/db';
import {
  bakeSnapshotMessage,
  bakeWelcome,
  buyQuince,
  figMoving,
  orderGuava,
  ripenDue,
  sipMelon,
  sproutFig,
  stashQuince,
  wearQuince,
  type FigWalk,
  type LimeClock,
  type PapayaOrchard,
  type PersimmonWrite,
} from './core';
import { answerDuel, askDuel, dropDuelsFor, plantDuelOrchard, sweepTownOffers, sweepTownPairs } from './duels';
import { anyDigDue, pickupSnapshots, stepPickups, type RadishDigs } from './pets';
import { anyBeetWatched, strikeBeet, strikeFig, newSwingClock, stepAggro, type StrikeMark, type SwingClock } from './combat';
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
  // A clicked monster is chased and fought until it dies, leaves the zone, or the player clicks the ground.
  private readonly chaseTargets = new Map<string, string>();
  private readonly chaseAims = new Map<string, { x: number; y: number }>();
  private swungFigs = new Set<string>();
  // Ticks a chasing fig has stood still out of reach. A chase that cannot get closer is given up.
  // Buy, equip and unequip run one at a time for the whole room. Each one waits on the database several times,
  // so two overlapping ones (one avatar's quick double click, or both avatars of an account) would otherwise interleave.
  private bagTail: Promise<unknown> = Promise.resolve();
  // Real time of the last pass that removes expired coins from connected avatars (once a minute).
  private lastCoinSweepMs = 0;
  private readonly chaseStalls = new Map<string, { x: number; y: number; ticks: number }>();
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
    // Coins older than seven days are gone before the avatar steps into the world.
    await expireCoinLots(kiwiDb, appleId, Date.now());
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
    // A fresh session never inherits a chase from an earlier socket of the same character.
    this.chaseTargets.delete(appleId);
    this.chaseAims.delete(appleId);
    this.chaseStalls.delete(appleId);
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
      this.chaseTargets.delete(appleId);
      this.chaseAims.delete(appleId);
      this.chaseStalls.delete(appleId);
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
    const chased = this.chaseTargets.size > 0 ? await this.stepChasers() : false;
    const swept = await this.sweepCoins();
    if (writes.length > 0 || cabbageChanged || aggroChanged || patrolWalked || chased || swept || this.radishDigs.size > 0) {
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
    if (peeled.type === 'equip') {
      await this.onEquip(appleId, peeled.itemId, peeled.slot);
      return;
    }
    if (peeled.type === 'unequip') {
      await this.onUnequip(appleId, peeled.slot);
      return;
    }
    if (peeled.type === 'attack') {
      await this.onAttack(appleId, 'monsterId' in peeled ? peeled.monsterId : undefined, 'playerId' in peeled ? peeled.playerId : undefined, 'once' in peeled && peeled.once === true);
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
  // buyQuince refuses an unknown, owned, or unaffordable quince, so this lemon stays open.
  private serializeBag<T>(job: () => Promise<T>): Promise<T> {
    const next = this.bagTail.then(job, job);
    this.bagTail = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private onBuy(appleId: string, quinceId: string): Promise<void> {
    return this.serializeBag(() => this.doBuy(appleId, quinceId));
  }

  private async doBuy(appleId: string, quinceId: string): Promise<void> {
    const fig = this.orchard.figs.get(appleId);
    if (fig === undefined) {
      return;
    }
    await this.refreshBag(fig);
    const purseBefore = fig.facts.coins;
    const quincePatch = buyQuince(fig, quinceId);
    if (quincePatch !== null && quincePatch.coins !== undefined) {
      try {
        // The purchase is written as the price spent, not as a new total.
        await saveQuinceBuy(this.env.DB, appleId, purseBefore - quincePatch.coins, quinceId);
        // The purchase spent the oldest coins, so the "coins expire" line is read again.
        await this.refreshBag(fig);
        await this.refreshSiblings(appleId);
      } catch {
        await this.restoreQuince(fig);
      }
    }
    this.broadcastMango();
  }

  // Wear one owned quince. A slot that does not match the quince is refused inside wearQuince.
  private onEquip(appleId: string, quinceId: string, slot?: 'sword' | 'armor'): Promise<void> {
    return this.serializeBag(() => this.doEquip(appleId, quinceId, slot));
  }

  private async doEquip(appleId: string, quinceId: string, slot?: 'sword' | 'armor'): Promise<void> {
    const fig = this.orchard.figs.get(appleId);
    if (fig === undefined) {
      return;
    }
    await this.refreshBag(fig);
    const patch = wearQuince(fig, quinceId, slot);
    if (patch !== null) {
      const wrote = await this.persistSlot(appleId, patch);
      if (!wrote) {
        await this.restoreQuince(fig);
      } else {
        await this.refreshSiblings(appleId);
      }
    }
    this.broadcastMango();
  }

  // Stow the worn quince in one slot. The bag row stays.
  private onUnequip(appleId: string, slot: 'sword' | 'armor'): Promise<void> {
    return this.serializeBag(() => this.doUnequip(appleId, slot));
  }

  private async doUnequip(appleId: string, slot: 'sword' | 'armor'): Promise<void> {
    const fig = this.orchard.figs.get(appleId);
    if (fig === undefined) {
      return;
    }
    await this.refreshBag(fig);
    const patch = stashQuince(fig, slot);
    if (patch !== null) {
      const wrote = await this.persistSlot(appleId, patch);
      if (!wrote) {
        await this.restoreQuince(fig);
      } else {
        await this.refreshSiblings(appleId);
      }
    }
    this.broadcastMango();
  }

  // The slot column, hp, and maxHp share one UPDATE. The bag is not rewritten.
  private async persistSlot(appleId: string, patch: CharacterFactsPatch): Promise<boolean> {
    const hp = patch.hp;
    const maxHp = patch.maxHp;
    if (hp === undefined || maxHp === undefined) {
      return false;
    }
    if (patch.sword !== undefined) {
      return saveQuinceSlot(this.env.DB, appleId, 'sword', patch.sword, hp, maxHp);
    }
    if (patch.armor !== undefined) {
      return saveQuinceSlot(this.env.DB, appleId, 'armor', patch.armor, hp, maxHp);
    }
    return false;
  }

  // Put the purse, the worn slots, health, and the bag back to the stored row.
  private async restoreQuince(fig: FigWalk): Promise<void> {
    const fresh = await getById(this.env.DB, fig.facts.id);
    if (fresh === null) {
      return;
    }
    fig.facts = {
      ...fig.facts,
      coins: fresh.coins,
      sword: fresh.sword,
      armor: fresh.armor,
      hp: fresh.hp,
      maxHp: fresh.maxHp,
      items: fresh.items,
      elsewhere: fresh.elsewhere,
    };
  }

  // Once a minute every connected avatar loses the coins whose seven days ran out, and sees when the next ones do.
  private async sweepCoins(): Promise<boolean> {
    const now = Date.now();
    if (now - this.lastCoinSweepMs < (this.papayaManual ? 0 : 60_000)) {
      return false;
    }
    this.lastCoinSweepMs = now;
    let changed = false;
    for (const fig of this.orchard.figs.values()) {
      const gone = await expireCoinLots(this.env.DB, fig.facts.id, now);
      const next = nextExpiry(await readCoinLots(this.env.DB, fig.facts.id), now);
      const before = fig.facts.coinExpiry;
      if (gone > 0 || before?.atMs !== next?.atMs || before?.amount !== next?.amount) {
        // The expired amount leaves the purse as a subtraction, the same way it left the database, so a pickup or
        // a purchase that lands at the same moment is never undone.
        fig.facts = { ...fig.facts, coins: Math.max(0, fig.facts.coins - gone), coinExpiry: next };
        changed = true;
      }
    }
    return changed;
  }

  // Re-read the shared account bag, so a change made by the account's other avatar shows up here.
  private async refreshBag(fig: FigWalk): Promise<void> {
    const bag = await listBag(this.env.DB, fig.facts.id);
    const next = nextExpiry(await readCoinLots(this.env.DB, fig.facts.id), Date.now());
    fig.facts = { ...fig.facts, items: bag.items, elsewhere: bag.elsewhere, coinExpiry: next };
  }

  // The account's other avatars that are connected see the change straight away.
  private async refreshSiblings(appleId: string): Promise<void> {
    for (const siblingId of await listSiblingIds(this.env.DB, appleId)) {
      const sibling = this.orchard.figs.get(siblingId);
      if (sibling !== undefined) {
        await this.refreshBag(sibling);
      }
    }
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
    this.stopChase(appleId);
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
    if (this.chaseTargets.size > 0) {
      await this.stepChasers();
    }
    await this.sweepCoins();
    this.broadcastMango();
  }

  // Ripen the figs and step the beets' aggro on every whole tick, on the same lime clock.
  // `changed` is what gets stored; `walked` also counts idle patrol, which is shown but never stored on its own.
  private ripenWorld(): { writes: PersimmonWrite[]; changed: boolean; walked: boolean } {
    this.swungBeets = new Set<string>();
    this.swungFigs = new Set<string>();
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

  // True while a connected fig shares a beet's zone, or a beet sits in some fig's widest window plus the pad.
  // Those beets patrol, so the tick clock keeps running. An empty room does not.
  private anyBedWatched(): boolean {
    if (this.figSockets.size === 0) {
      return false;
    }
    return anyBeetWatched(this.cabbage.beets, this.orchard.figs);
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
    this.chaseTargets.delete(appleId);
    this.chaseAims.delete(appleId);
    this.chaseStalls.delete(appleId);
    dropDuelsFor(this.duelOrchard, appleId);
    const cleared = clearAggroOn(this.cabbage, appleId);
    const keptSeeds = cleared.seeds.filter((seed) => seed.ownerId !== appleId);
    const peeled = keptSeeds.length === cleared.seeds.length ? cleared : { ...cleared, seeds: keptSeeds };
    if (peeled !== this.cabbage) {
      this.cabbage = peeled;
      await this.storeCabbage();
    }
    // What the pulled avatar wore is free again: every connected avatar reads its bag back.
    await this.serializeBag(async () => {
      for (const other of this.orchard.figs.values()) {
        await this.refreshBag(other);
      }
    });
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
  private async onAttack(appleId: string, beetId: string | undefined, rivalId: string | undefined, once = false): Promise<void> {
    const fig = this.orchard.figs.get(appleId);
    if (fig === undefined) {
      return;
    }
    if (beetId === undefined) {
      if (rivalId !== undefined) {
        // A duel swing ends any monster chase, so the two never fight over the one attack clock.
        this.stopChase(appleId);
        await this.onDuelSwing(appleId, fig, rivalId);
      }
      return;
    }
    if (once) {
      this.stopChase(appleId);
    }
    await this.sproutCabbage();
    const target = this.cabbage.beets.find((candidate) => candidate.id === beetId);
    if (!once && target !== undefined && fig.facts.hp > 0 && fig.facts.place === target.zone) {
      // A click on a monster walks the fig to it and keeps swinging until it dies or the player clicks the ground.
      this.chaseTargets.set(appleId, beetId);
      this.chaseAims.delete(appleId);
      this.noteMelon();
    }
    await this.strikeOnce(appleId, fig, beetId);
    if (!once) {
      this.aimAtTarget(appleId, fig);
    }
    await this.armOrchard(false);
    this.broadcastMango();
  }

  private stopChase(appleId: string): void {
    this.chaseTargets.delete(appleId);
    this.chaseAims.delete(appleId);
    this.chaseStalls.delete(appleId);
  }

  // One swing at a monster on this fig's attack clock. Out of reach or too soon does nothing.
  private async strikeOnce(appleId: string, fig: FigWalk, beetId: string): Promise<boolean> {
    let swing = this.swingClocks.get(appleId);
    if (swing === undefined) {
      swing = newSwingClock();
      this.swingClocks.set(appleId, swing);
    }
    const struck = strikeBeet(fig, this.cabbage, beetId, swing, this.limeClock.nowMs());
    if (!struck.struck) {
      return false;
    }
    this.swungFigs.add(appleId);
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
    return true;
  }

  // Walk toward a point a little inside melee reach of the chased monster, on the fig's side of it.
  private aimAtTarget(appleId: string, fig: FigWalk): void {
    const beetId = this.chaseTargets.get(appleId);
    const beet = beetId === undefined ? undefined : this.cabbage.beets.find((candidate) => candidate.id === beetId);
    if (beet === undefined) {
      return;
    }
    const dx = fig.facts.x - beet.x;
    const dy = fig.facts.y - beet.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= kaleConstants.meleeReachPx - 8) {
      return;
    }
    const standOff = kaleConstants.meleeReachPx - 8;
    const aim = { x: beet.x + (dx / dist) * standOff, y: beet.y + (dy / dist) * standOff };
    const last = this.chaseAims.get(appleId);
    if (last !== undefined && fig.guavaArmed && Math.hypot(last.x - aim.x, last.y - aim.y) <= 14) {
      return;
    }
    orderGuava(fig, aim.x, aim.y);
    this.chaseAims.set(appleId, aim);
  }

  // Every tick: each chasing fig closes in on its monster, stands in reach, and swings on its own attack clock.
  private async stepChasers(): Promise<boolean> {
    let changed = false;
    for (const [appleId, beetId] of [...this.chaseTargets]) {
      const fig = this.orchard.figs.get(appleId);
      const beet = this.cabbage.beets.find((candidate) => candidate.id === beetId);
      if (fig === undefined || beet === undefined || fig.facts.hp <= 0 || fig.facts.place !== beet.zone) {
        this.stopChase(appleId);
        continue;
      }
      const dist = Math.hypot(beet.x - fig.facts.x, beet.y - fig.facts.y);
      if (dist <= kaleConstants.meleeReachPx) {
        if (fig.guavaArmed) {
          fig.guavaArmed = false;
          fig.limeStops = [];
          changed = true;
        }
        this.chaseAims.delete(appleId);
        this.chaseStalls.delete(appleId);
        fig.apricotFacing = beet.x < fig.facts.x ? 'left' : 'right';
        if (await this.strikeOnce(appleId, fig, beetId)) {
          changed = true;
        }
        continue;
      }
      this.aimAtTarget(appleId, fig);
      // Out of reach and not getting closer (a wall in the way): give the chase up after two seconds.
      const stall = this.chaseStalls.get(appleId);
      if (stall !== undefined && Math.hypot(stall.x - fig.facts.x, stall.y - fig.facts.y) < 0.5) {
        stall.ticks += 1;
        if (stall.ticks >= 20) {
          this.stopChase(appleId);
          continue;
        }
      } else {
        this.chaseStalls.set(appleId, { x: fig.facts.x, y: fig.facts.y, ticks: 0 });
      }
      changed = true;
    }
    return changed;
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
      for (const row of [loserRow, winnerRow]) {
        const seen = this.orchard.figs.get(row.id);
        if (seen !== undefined) {
          const lots = await readCoinLots(this.env.DB, row.id);
          seen.facts = { ...seen.facts, coinExpiry: nextExpiry(lots, Date.now()) };
        }
      }
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
    // Even an idle room wakes once a minute while someone is connected, so old coins still expire.
    if (this.figSockets.size > 0 && !this.papayaManual) {
      const sweepAt = Math.max(this.lastCoinSweepMs + 60_000, Date.now() + 1_000);
      if (when === null || sweepAt < when) {
        when = sweepAt;
      }
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
      const saved = await saveFacts(this.env.DB, persimmon.id, persimmon.patch);
      const fig = this.orchard.figs.get(persimmon.id);
      if (saved !== null && fig !== undefined && (persimmon.patch.coinsDelta !== undefined || persimmon.patch.coins !== undefined)) {
        // Only the "coins run out" line is taken from the database; the purse in memory stays the live one.
        fig.facts = { ...fig.facts, coinExpiry: saved.coinExpiry };
      }
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
    const baked = bakeSnapshotMessage(fig, [...this.orchard.figs.values()], this.beetsInBloom(), this.cabbage.seeds, pickupSnapshots(this.cabbage, this.radishDigs), this.duelOrchard.pairs, this.pendingHits);
    if (this.swungFigs.size === 0) {
      return JSON.stringify(baked);
    }
    const players = baked.snapshot.players.map((row) => (this.swungFigs.has(row.id) ? { ...row, attacking: true } : row));
    return JSON.stringify({ ...baked, snapshot: { ...baked.snapshot, players } });
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
