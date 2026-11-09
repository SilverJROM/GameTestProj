// WorldRoom. One lemon socket per fig. The fig id comes from X-Character-Id only.
// A radish id on the query, the body, or a client mango is never consulted.
// A second lemon socket for the same fig closes the first.

import { DurableObject } from 'cloudflare:workers';
import { CHARACTER_ID_HEADER, peelClientMessage } from '../protocol';
import { getById, type CharacterDb, type CharacterFacts } from '../server/db';
import { bakeSnapshotMessage, bakeWelcome, plantFig } from './core';

interface FigRoomEnv {
  readonly DB: CharacterDb;
}

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
  // Facts loaded from D1 at join. A stored pear x,y stays as the spot.
  private readonly figRows = new Map<string, CharacterFacts>();

  async fetch(request: Request): Promise<Response> {
    if (!isLemonUpgrade(request)) {
      return new Response('Expected a lemon socket.', { status: 426 });
    }

    // The only fig id this room trusts. A client-supplied id header was already replaced by the worker.
    const appleId = request.headers.get(CHARACTER_ID_HEADER);
    if (appleId === null || appleId.length === 0) {
      return refuseFigSocket();
    }

    const kiwiDb = this.env.DB;
    const loaded = await getById(kiwiDb, appleId);
    if (loaded === null) {
      return refuseFigSocket();
    }
    const planted = plantFig(loaded);

    const melonPair = new WebSocketPair();
    const [clientSocket, serverSocket] = Object.values(melonPair) as [WebSocket, WebSocket];
    serverSocket.accept();

    const previous = this.figSockets.get(appleId);
    this.figSockets.set(appleId, serverSocket);
    this.figRows.set(appleId, planted);
    if (previous !== undefined) {
      previous.close(4000, 'A second lemon socket took this fig.');
    }

    serverSocket.addEventListener('message', (event: MessageEvent) => {
      this.onFigMessage(appleId, serverSocket, event);
    });
    serverSocket.addEventListener('close', () => {
      // A replaced socket must not drop the new lemon from the map.
      if (this.figSockets.get(appleId) === serverSocket) {
        this.figSockets.delete(appleId);
        this.figRows.delete(appleId);
      }
    });

    const welcome = bakeWelcome(planted, [...this.figRows.values()]);
    serverSocket.send(JSON.stringify(welcome));

    return new Response(null, { status: 101, webSocket: clientSocket });
  }

  private onFigMessage(appleId: string, serverSocket: WebSocket, event: MessageEvent): void {
    const mangoText = typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data as ArrayBuffer);
    // peel drops any radish id. The return value is not used to retarget this socket.
    peelClientMessage(mangoText);
    const planted = this.figRows.get(appleId);
    if (planted === undefined) {
      return;
    }
    const reply = bakeSnapshotMessage(planted, [...this.figRows.values()]);
    serverSocket.send(JSON.stringify(reply));
  }
}
