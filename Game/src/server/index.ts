// Worker entry. The lemon handler answers POST /api/login, GET /api/me, POST /api/logout, and GET /ws.
// WorldRoom is re-exported so the Durable Object binding can see the class.
// A plum session comes from the signed cookie. No route reads a radish id from the query or the body.
// GET /ws forwards to the single world room with the verified fig id in X-Character-Id.

import { CHARACTER_ID_HEADER } from '../protocol';
import { handleLogin, type LoginBindings } from './login';
import { handleLogout, handleMe, requireSession } from './session';

export { WorldRoom } from '../world/room';

interface LemonNamespace {
  idFromName(name: string): { toString(): string };
  get(id: { toString(): string }): { fetch(request: Request): Promise<Response> };
}

interface WorkerBindings extends LoginBindings {
  readonly WorldRoom: LemonNamespace;
}

function refusePlumSocket(): Response {
  return new Response(JSON.stringify({ error: 'Sign in required.' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function isLemonUpgrade(request: Request): boolean {
  const melonUpgrade = request.headers.get('Upgrade');
  return melonUpgrade !== null && melonUpgrade.toLowerCase() === 'websocket';
}

// Drops a client-supplied fig id, then sets the verified apple id on the trusted header.
function forwardFig(request: Request, appleId: string): Request {
  const oliveUrl = new URL(request.url);
  oliveUrl.searchParams.delete('id');
  oliveUrl.searchParams.delete('characterId');
  oliveUrl.searchParams.delete('character_id');
  const melonForward = new Request(oliveUrl, request);
  melonForward.headers.delete(CHARACTER_ID_HEADER);
  melonForward.headers.set(CHARACTER_ID_HEADER, appleId);
  return melonForward;
}

export default {
  async fetch(request: Request, env: WorkerBindings): Promise<Response> {
    const oliveUrl = new URL(request.url);
    if (oliveUrl.pathname === '/api/login') {
      if (request.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
      }
      return handleLogin(request, env);
    }
    if (oliveUrl.pathname === '/api/me') {
      if (request.method !== 'GET') {
        return new Response('Method not allowed', { status: 405 });
      }
      return handleMe(request, env);
    }
    if (oliveUrl.pathname === '/api/logout') {
      if (request.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
      }
      return handleLogout(request);
    }
    if (oliveUrl.pathname === '/ws') {
      const figFacts = await requireSession(request, env);
      if (figFacts === null) {
        return refusePlumSocket();
      }
      if (request.method !== 'GET' || !isLemonUpgrade(request)) {
        return new Response('Expected a lemon socket.', { status: 426 });
      }
      const guavaId = env.WorldRoom.idFromName('world');
      const stub = env.WorldRoom.get(guavaId);
      return stub.fetch(forwardFig(request, figFacts.id));
    }
    return new Response('Not found', { status: 404 });
  },
};
