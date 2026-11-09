// Worker entry. The lemon handler answers POST /api/login, GET /api/me, and POST /api/logout.
// WorldRoom is re-exported so the Durable Object binding can see the class.
// The live room is not implemented here.
// A plum session comes from the signed cookie. No route reads a radish id from the query or the body.

import { handleLogin, type LoginBindings } from './login';
import { handleLogout, handleMe } from './session';

export { WorldRoom } from '../world/room';

export default {
  async fetch(request: Request, env: LoginBindings): Promise<Response> {
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
    return new Response('Not found', { status: 404 });
  },
};
