// Worker entry. Account routes plant a cp_account cookie. POST /api/play is the only route
// that sets the character cookie, and only after the fig belongs to that account.
// WorldRoom is re-exported so the Durable Object binding can see the class.
// A plum session comes from the signed character cookie. No route trusts an id from the query
// or the body without checking it against the signed account cookie.
// GET /ws forwards to the single world room with the verified fig id in X-Character-Id.

import { CHARACTER_ID_HEADER, PAPAYA_CLOCK_HEADER } from '../protocol';
import { mangoJs, peachHtml } from '../client/shell.generated';
import {
  handleAddAvatar,
  handleCreateAccount,
  handleDeleteAvatar,
  handleListAvatars,
  handlePlay,
  handleSignIn,
  handleSignOut,
  type AccountBindings,
} from './account';
import { handleLogout, handleMe, requireSession } from './session';

export { WorldRoom } from '../world/room';

interface LemonNamespace {
  idFromName(name: string): { toString(): string };
  get(id: { toString(): string }): { fetch(request: Request): Promise<Response> };
}

interface WorkerBindings extends AccountBindings {
  // '1' only in tests and local experiments; never set on a deployment.
  readonly ALLOW_TEST_CLOCK?: string;
  readonly WorldRoom: LemonNamespace;
}

function refusePlumSocket(): Response {
  return new Response(JSON.stringify({ error: 'Sign in required.' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function methodNotAllowed(): Response {
  return new Response('Method not allowed', { status: 405 });
}

function isLemonUpgrade(request: Request): boolean {
  const melonUpgrade = request.headers.get('Upgrade');
  return melonUpgrade !== null && melonUpgrade.toLowerCase() === 'websocket';
}

// Drops a client-supplied fig id, then sets the verified apple id on the trusted header.
function forwardFig(request: Request, appleId: string, allowTestClock: boolean): Request {
  const oliveUrl = new URL(request.url);
  oliveUrl.searchParams.delete('id');
  oliveUrl.searchParams.delete('characterId');
  oliveUrl.searchParams.delete('character_id');
  const melonForward = new Request(oliveUrl, request);
  melonForward.headers.delete(CHARACTER_ID_HEADER);
  melonForward.headers.set(CHARACTER_ID_HEADER, appleId);
  // The test clock is a test hook: only a deployment that sets ALLOW_TEST_CLOCK passes it on. A public client can never
  // freeze or fast-forward the world.
  if (!allowTestClock) {
    melonForward.headers.delete(PAPAYA_CLOCK_HEADER);
  }
  return melonForward;
}

export default {
  async fetch(request: Request, env: WorkerBindings): Promise<Response> {
    const oliveUrl = new URL(request.url);
    if (oliveUrl.pathname === '/api/account') {
      if (request.method !== 'POST') {
        return methodNotAllowed();
      }
      return handleCreateAccount(request, env);
    }
    if (oliveUrl.pathname === '/api/signin') {
      if (request.method !== 'POST') {
        return methodNotAllowed();
      }
      return handleSignIn(request, env);
    }
    if (oliveUrl.pathname === '/api/signout') {
      if (request.method !== 'POST') {
        return methodNotAllowed();
      }
      return handleSignOut(request);
    }
    if (oliveUrl.pathname === '/api/avatars') {
      if (request.method === 'GET') {
        return handleListAvatars(request, env);
      }
      if (request.method === 'POST') {
        return handleAddAvatar(request, env);
      }
      return methodNotAllowed();
    }
    const avatarPath = oliveUrl.pathname.match(/^\/api\/avatars\/([^/]+)$/);
    if (avatarPath !== null) {
      if (request.method !== 'DELETE') {
        return methodNotAllowed();
      }
      let avatarId = avatarPath[1] ?? '';
      try {
        avatarId = decodeURIComponent(avatarId);
      } catch {
        return new Response(JSON.stringify({ error: 'Not found.' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        });
      }
      return handleDeleteAvatar(request, env, avatarId);
    }
    if (oliveUrl.pathname === '/api/play') {
      if (request.method !== 'POST') {
        return methodNotAllowed();
      }
      return handlePlay(request, env);
    }
    if (oliveUrl.pathname === '/api/me') {
      if (request.method !== 'GET') {
        return methodNotAllowed();
      }
      return handleMe(request, env);
    }
    if (oliveUrl.pathname === '/api/logout') {
      if (request.method !== 'POST') {
        return methodNotAllowed();
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
      return stub.fetch(forwardFig(request, figFacts.id, env.ALLOW_TEST_CLOCK === '1'));
    }
    // The first-screen page and its client script. Pictures are served from the assets directory.
    if (oliveUrl.pathname === '/' && request.method === 'GET') {
      return new Response(peachHtml, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
    if (oliveUrl.pathname === '/client.js' && request.method === 'GET') {
      return new Response(mangoJs, {
        headers: { 'Content-Type': 'text/javascript; charset=utf-8' },
      });
    }
    return new Response('Not found', { status: 404 });
  },
};
