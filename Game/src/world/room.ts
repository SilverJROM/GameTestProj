// WorldRoom. One lemon socket per fig. The fig id comes from X-Character-Id only.
// A radish id on the query, the body, or a client mango is never consulted.
// A second lemon socket for the same fig closes the first.
// A move mango aims that fig at a guava. The papaya walk ripens on the rules tick.
// A lemon that joined with the papaya header sprouts those ticks from ripen mangos.
// Every other lemon uses the wall clock, one alarm per rules tick, and never sleeps inside a step.

import { DurableObject } from 'cloudflare:workers';
import {
  CHARACTER_ID_HEADER,
  PAPAYA_CLOCK_HEADER,
  PAPAYA_CLOCK_RIPE,
  peelClientMessage,
} from '../protocol';
import { kaleConstants } from '../rules/tables';
import { getById, saveFacts, type CharacterDb } from '../server/db';
import {
  bakeSnapshotMessage,
  bakeWelcome,
  figMoving,
  orderGuava,
  ripenDue,
  sproutFig,
  type FigWalk,
  type LimeClock,
  type PapayaOrchard,
  type PersimmonWrite,
} from './core';

interface FigRoomEnv {
  readonly DB: CharacterDb;
}

// Cap so one ripen mango cannot loop the orchard forever.
const oliveStepCap = 10_000;

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

  async fetch(request: Request): Promise<Response> {
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
    this.figSockets.set(appleId, serverSocket);
    this.orchard.figs.set(appleId, planted);
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
    });

    const welcome = bakeWelcome(planted, [...this.orchard.figs.values()]);
    serverSocket.send(JSON.stringify(welcome));

    return new Response(null, { status: 101, webSocket: clientSocket });
  }

  async alarm(): Promise<void> {
    if (this.papayaManual || !this.melonPrimed) {
      return;
    }
    const writes = ripenDue(this.orchard);
    await this.persistPersimmons(writes);
    if (writes.length > 0) {
      this.broadcastMango();
    }
    if (this.anyFigMoving()) {
      await this.ctx.storage.setAlarm(Date.now() + kaleConstants.tickMs);
    }
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
    if (!this.papayaManual) {
      this.replyOne(appleId, serverSocket);
      return;
    }
    await this.onRipen(peeled.steps);
  }

  private noteMelon(): void {
    this.orchard.wateredMs = this.limeClock.nowMs();
    this.melonPrimed = true;
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
    const writes = ripenDue(this.orchard);
    await this.persistPersimmons(writes);
    this.broadcastMango();
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
    if (this.papayaManual || !this.anyFigMoving()) {
      return;
    }
    const existing = await this.ctx.storage.getAlarm();
    if (existing === null) {
      await this.ctx.storage.setAlarm(Date.now() + kaleConstants.tickMs);
    }
  }

  private snapshotMango(appleId: string): string | null {
    const fig = this.orchard.figs.get(appleId);
    if (fig === undefined) {
      return null;
    }
    return JSON.stringify(bakeSnapshotMessage(fig, [...this.orchard.figs.values()]));
  }

  private replyOne(appleId: string, socket: WebSocket): void {
    const mango = this.snapshotMango(appleId);
    if (mango !== null) {
      socket.send(mango);
    }
  }

  private broadcastMango(): void {
    for (const [appleId, socket] of this.figSockets) {
      const mango = this.snapshotMango(appleId);
      if (mango !== null) {
        socket.send(mango);
      }
    }
  }
}
