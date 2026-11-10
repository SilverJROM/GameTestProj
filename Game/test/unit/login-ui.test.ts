// Account screens with a mocked fetch and a small stand-in for the document.
// No browser: the gate, the two fig slots, and the plant form are driven through the exported functions.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  figDeleteWindowMs,
  resumeFigs,
  wireScreens,
} from '../../src/client/client.js';

const pageHtml = readFileSync(new URL('../../src/client/index.html', import.meta.url), 'utf8');

interface FakeElement {
  value: string;
  checked: boolean;
  hidden: boolean;
  textContent: string;
  src: string;
  stand: string;
  figId: string;
  listeners: Record<string, Array<(event: { preventDefault(): void }) => void>>;
  addEventListener(type: string, listener: (event: { preventDefault(): void }) => void): void;
}

function fakeElement(initial: Partial<FakeElement> = {}): FakeElement {
  const element: FakeElement = {
    value: '',
    checked: false,
    hidden: false,
    textContent: '',
    src: '',
    stand: '',
    figId: '',
    listeners: {},
    addEventListener(type, listener) {
      (element.listeners[type] ??= []).push(listener);
    },
    ...initial,
  };
  return element;
}

interface FakeDoc {
  elements: Map<string, FakeElement>;
  getElementById(id: string): FakeElement;
}

// Mirrors the ids in src/client/index.html. The canvas has no getContext, so no drawing is attempted.
function fakeDocument(): FakeDoc {
  const elements = new Map<string, FakeElement>();
  const add = (id: string, initial: Partial<FakeElement> = {}) => {
    elements.set(id, fakeElement(initial));
  };
  add('apple-login');
  add('apple-form');
  add('kiwi-user');
  add('kiwi-pass');
  add('kiwi-signin');
  add('kiwi-create');
  add('pear-refusal');
  add('fig-roster', { hidden: true });
  add('fig-roster-error');
  add('fig-signout');
  add('fig-plant', { hidden: true });
  add('fig-plant-form');
  add('fig-plant-error');
  add('lime-woman', { checked: true });
  add('lime-man');
  add('lime-preview');
  add('kiwi-name');
  add('fig-create');
  add('fig-back');
  add('papaya-canvas', { hidden: true });
  add('kiwi-zoom', { hidden: true });
  for (let index = 0; index < 2; index += 1) {
    add(`fig-slot-${index}`);
    add(`fig-filled-${index}`, { hidden: true });
    add(`fig-empty-${index}`);
    add(`fig-name-${index}`);
    add(`fig-level-${index}`);
    add(`fig-preview-${index}`);
    add(`fig-play-${index}`, { textContent: 'Play' });
    add(`fig-delete-${index}`, { textContent: 'Delete' });
    add(`fig-add-${index}`, { textContent: 'Add avatar' });
  }
  return {
    elements,
    getElementById(id: string): FakeElement {
      const found = elements.get(id);
      if (found === undefined) {
        throw new Error(`no element ${id}`);
      }
      return found;
    },
  };
}

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

interface FetchCall {
  method: string;
  path: string;
  init: RequestInit;
}

function callsOf(fetchMock: ReturnType<typeof vi.fn>): FetchCall[] {
  return fetchMock.mock.calls.map((call) => {
    const init = (call[1] ?? {}) as RequestInit;
    return { method: init.method ?? 'GET', path: String(call[0]), init };
  });
}

function press(el: FakeElement) {
  const preventDefault = vi.fn();
  const listeners = el.listeners.click ?? [];
  if (listeners.length === 0) {
    throw new Error('no click listener');
  }
  for (const listener of listeners) listener({ preventDefault });
  return preventDefault;
}

function change(el: FakeElement) {
  for (const listener of el.listeners.change ?? []) listener({ preventDefault() {} });
}

function assertPasswordAbsent(doc: FakeDoc, password: string) {
  expect(doc.getElementById('kiwi-pass').value).toBe('');
  for (const el of doc.elements.values()) {
    expect(el.value).not.toContain(password);
    expect(el.textContent).not.toContain(password);
    expect(el.src).not.toContain(password);
  }
}

interface FigRow {
  id: string;
  name: string;
  gender: 'woman' | 'man';
  level: number;
}

function rosterFetch(start: FigRow[]) {
  let rows = start.map((row) => ({ ...row }));
  const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const url = String(path);
    if (method === 'GET' && url === '/api/avatars') return jsonResponse(200, rows);
    if (method === 'POST' && url === '/api/signin') return jsonResponse(401, { error: 'Wrong username or password' });
    if (method === 'POST' && url === '/api/account') return jsonResponse(200, { username: 'ada_fig' });
    if (method === 'POST' && url === '/api/avatars') {
      const body = JSON.parse(String(init?.body)) as { name?: string; gender?: 'woman' | 'man' };
      const name = body.name ?? '';
      if (name.trim().length === 0) return jsonResponse(400, { error: 'Name is blank.' });
      if (rows.some((row) => row.name.toLowerCase() === name.trim().toLowerCase()) || name === 'Taken') {
        return jsonResponse(409, { error: 'Name taken' });
      }
      rows = [
        ...rows,
        { id: 'fig-nia', name: name.trim(), gender: body.gender === 'man' ? 'man' : 'woman', level: 1 },
      ];
      return jsonResponse(200, rows[rows.length - 1]);
    }
    if (method === 'DELETE' && url.startsWith('/api/avatars/')) {
      const id = decodeURIComponent(url.slice('/api/avatars/'.length));
      rows = rows.filter((row) => row.id !== id);
      return jsonResponse(200, { ok: true });
    }
    if (method === 'POST' && url === '/api/play') {
      return jsonResponse(200, { id: 'fig-nia', name: 'Nia', gender: 'woman', place: 'town' });
    }
    if (method === 'GET' && url === '/api/me') {
      return jsonResponse(200, { id: 'fig-nia', name: 'Nia', gender: 'woman', place: 'town', level: 1 });
    }
    if (method === 'POST' && url === '/api/signout') return jsonResponse(200, { ok: true });
    throw new Error(`unexpected ${method} ${url}`);
  });
  return { fetchMock, read: () => rows };
}

describe('account screen markup', () => {
  it('shows the recovery note, a password field, and the three screens', () => {
    expect(pageHtml).toContain('No email is needed. A forgotten password cannot be recovered.');
    expect(pageHtml).toContain('type="password"');
    expect(pageHtml).toContain('autocomplete="username"');
    expect(pageHtml).toContain('autocomplete="current-password"');
    expect(pageHtml).toContain('>Sign in<');
    expect(pageHtml).toContain('>Create account<');
    expect(pageHtml).toContain('>Your avatars<');
    expect(pageHtml).toContain('>Add avatar<');
    expect(pageHtml).toContain('>Play<');
    expect(pageHtml).toContain('>Delete<');
    expect(pageHtml).toContain('>Sign out<');
    expect(pageHtml).toContain('>Create<');
    expect(pageHtml).toContain('>Back<');
    expect(pageHtml).toContain('id="fig-slot-0"');
    expect(pageHtml).toContain('id="fig-slot-1"');
    expect(pageHtml).toContain('id="lime-woman"');
    expect(pageHtml).toContain('id="lime-man"');
    expect(pageHtml).toMatch(/id="lime-woman"[^>]*checked/);
    expect(pageHtml).toContain('id="kiwi-zoom"');
    expect(pageHtml).not.toContain('/api/login');
  });
});

describe('account screens', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows the server message when sign-in fails and clears the password', async () => {
    const peachDoc = fakeDocument();
    const password = 's3cret-pear';
    const logs = ['log', 'info', 'debug', 'warn', 'error'].map((name) =>
      vi.spyOn(console, name as 'log').mockImplementation(() => {}),
    );
    const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (method === 'GET' && path === '/api/avatars') return jsonResponse(401, { error: 'Sign in required.' });
      if (method === 'POST' && path === '/api/signin') {
        expect(peachDoc.getElementById('kiwi-pass').value).toBe('');
        expect(String(path)).not.toContain(password);
        return jsonResponse(401, { error: 'Wrong username or password' });
      }
      throw new Error(`unexpected ${method} ${path}`);
    });

    await wireScreens(peachDoc as unknown as Document, fetchMock);
    peachDoc.getElementById('kiwi-user').value = 'ada';
    peachDoc.getElementById('kiwi-pass').value = password;
    press(peachDoc.getElementById('kiwi-signin'));
    await vi.waitFor(() => {
      expect(peachDoc.getElementById('pear-refusal').textContent).toBe('Wrong username or password');
    });

    const posts = callsOf(fetchMock).filter((call) => call.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0]?.path).toBe('/api/signin');
    expect(posts[0]?.init.credentials).toBe('same-origin');
    expect(JSON.parse(String(posts[0]?.init.body))).toEqual({ username: 'ada', password });
    assertPasswordAbsent(peachDoc, password);
    expect(peachDoc.getElementById('apple-login').hidden).toBe(false);
    expect(peachDoc.getElementById('fig-roster').hidden).toBe(true);
    expect(peachDoc.getElementById('papaya-canvas').hidden).toBe(true);
    expect(peachDoc.getElementById('kiwi-zoom').hidden).toBe(true);
    for (const spy of logs) {
      for (const call of spy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(password);
      }
    }
  });

  it('creates an account and shows the empty avatar screen', async () => {
    const peachDoc = fakeDocument();
    const password = 'pearpass1';
    let signedIn = false;
    const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (method === 'GET' && path === '/api/avatars') {
        return signedIn ? jsonResponse(200, []) : jsonResponse(401, { error: 'Sign in required.' });
      }
      if (method === 'POST' && path === '/api/account') {
        expect(peachDoc.getElementById('kiwi-pass').value).toBe('');
        expect(String(path)).not.toContain(password);
        signedIn = true;
        return jsonResponse(200, { username: 'ada_fig' });
      }
      throw new Error(`unexpected ${method} ${path}`);
    });

    await wireScreens(peachDoc as unknown as Document, fetchMock);
    peachDoc.getElementById('kiwi-user').value = 'ada_fig';
    peachDoc.getElementById('kiwi-pass').value = password;
    press(peachDoc.getElementById('kiwi-create'));
    await vi.waitFor(() => {
      expect(peachDoc.getElementById('fig-roster').hidden).toBe(false);
    });

    const account = callsOf(fetchMock).find((call) => call.path === '/api/account');
    expect(account?.method).toBe('POST');
    expect(JSON.parse(String(account?.init.body))).toEqual({ username: 'ada_fig', password });
    assertPasswordAbsent(peachDoc, password);
    expect(peachDoc.getElementById('apple-login').hidden).toBe(true);
    expect(peachDoc.getElementById('fig-plant').hidden).toBe(true);
    expect(peachDoc.getElementById('fig-filled-0').hidden).toBe(true);
    expect(peachDoc.getElementById('fig-filled-1').hidden).toBe(true);
    expect(peachDoc.getElementById('fig-empty-0').hidden).toBe(false);
    expect(peachDoc.getElementById('fig-empty-1').hidden).toBe(false);
    expect(peachDoc.getElementById('fig-add-0').textContent).toBe('Add avatar');
    expect(peachDoc.getElementById('papaya-canvas').hidden).toBe(true);
  });

  it('adds an avatar, switches the stand-still preview, and returns to the list', async () => {
    const peachDoc = fakeDocument();
    const { fetchMock } = rosterFetch([]);
    await wireScreens(peachDoc as unknown as Document, fetchMock);

    press(peachDoc.getElementById('fig-add-0'));
    const preview = peachDoc.getElementById('lime-preview');
    expect(peachDoc.getElementById('fig-plant').hidden).toBe(false);
    expect(peachDoc.getElementById('fig-roster').hidden).toBe(true);
    expect(peachDoc.getElementById('lime-woman').checked).toBe(true);
    expect(preview.src).toBe('/avatars/warrior-f/stand.png');

    peachDoc.getElementById('lime-woman').checked = false;
    peachDoc.getElementById('lime-man').checked = true;
    change(peachDoc.getElementById('lime-man'));
    expect(preview.src).toBe('/avatars/warrior-m/stand.png');

    peachDoc.getElementById('lime-man').checked = false;
    peachDoc.getElementById('lime-woman').checked = true;
    change(peachDoc.getElementById('lime-woman'));
    expect(preview.src).toBe('/avatars/warrior-f/stand.png');

    press(peachDoc.getElementById('fig-back'));
    await vi.waitFor(() => {
      expect(peachDoc.getElementById('fig-roster').hidden).toBe(false);
    });
    expect(callsOf(fetchMock).some((call) => call.method === 'POST' && call.path === '/api/avatars')).toBe(false);

    press(peachDoc.getElementById('fig-add-1'));
    expect(preview.src).toBe('/avatars/warrior-f/stand.png');
    peachDoc.getElementById('lime-woman').checked = false;
    peachDoc.getElementById('lime-man').checked = true;
    change(peachDoc.getElementById('lime-man'));
    peachDoc.getElementById('kiwi-name').value = 'Nia';
    press(peachDoc.getElementById('fig-create'));
    await vi.waitFor(() => {
      expect(peachDoc.getElementById('fig-name-0').textContent).toBe('Nia');
    });

    const planted = callsOf(fetchMock).find((call) => call.method === 'POST' && call.path === '/api/avatars');
    expect(JSON.parse(String(planted?.init.body))).toEqual({ name: 'Nia', gender: 'man' });
    expect(peachDoc.getElementById('fig-roster').hidden).toBe(false);
    expect(peachDoc.getElementById('fig-plant').hidden).toBe(true);
    expect(peachDoc.getElementById('fig-level-0').textContent).toBe('Level 1');
    expect(peachDoc.getElementById('fig-preview-0').src).toBe('/avatars/warrior-m/stand.png');
    expect(peachDoc.getElementById('fig-filled-0').hidden).toBe(false);
    expect(peachDoc.getElementById('fig-empty-0').hidden).toBe(true);
    expect(peachDoc.getElementById('fig-filled-1').hidden).toBe(true);
    expect(peachDoc.getElementById('fig-empty-1').hidden).toBe(false);
    expect(peachDoc.getElementById('fig-play-0').textContent).toBe('Play');
    expect(peachDoc.getElementById('fig-add-1').textContent).toBe('Add avatar');
  });

  it('shows the server message when a name is blank or taken', async () => {
    const peachDoc = fakeDocument();
    const { fetchMock } = rosterFetch([{ id: 'fig-old', name: 'Nia', gender: 'woman', level: 2 }]);
    await wireScreens(peachDoc as unknown as Document, fetchMock);

    press(peachDoc.getElementById('fig-add-1'));
    peachDoc.getElementById('kiwi-name').value = '   ';
    press(peachDoc.getElementById('fig-create'));
    await vi.waitFor(() => {
      expect(peachDoc.getElementById('fig-plant-error').textContent).toBe('Name is blank.');
    });
    expect(peachDoc.getElementById('fig-plant').hidden).toBe(false);

    peachDoc.getElementById('kiwi-name').value = 'Nia';
    press(peachDoc.getElementById('fig-create'));
    await vi.waitFor(() => {
      expect(peachDoc.getElementById('fig-plant-error').textContent).toBe('Name taken');
    });
    expect(peachDoc.getElementById('fig-plant').hidden).toBe(false);
    expect(peachDoc.getElementById('fig-roster').hidden).toBe(true);
  });

  it('fills two slots and leaves an empty slot as Add avatar', async () => {
    const peachDoc = fakeDocument();
    const one: FigRow[] = [{ id: 'fig-a', name: 'Nia', gender: 'woman', level: 2 }];
    const two: FigRow[] = [
      ...one,
      { id: 'fig-b', name: 'Bob', gender: 'man', level: 4 },
    ];
    let rows: FigRow[] = [];
    const fetchMock = vi.fn(async () => jsonResponse(200, rows));
    await wireScreens(peachDoc as unknown as Document, fetchMock);
    expect(peachDoc.getElementById('fig-empty-0').hidden).toBe(false);
    expect(peachDoc.getElementById('fig-empty-1').hidden).toBe(false);
    expect(peachDoc.getElementById('fig-filled-0').hidden).toBe(true);
    expect(peachDoc.getElementById('fig-filled-1').hidden).toBe(true);

    rows = one;
    await resumeFigs(peachDoc as unknown as Document, fetchMock);
    expect(peachDoc.getElementById('fig-name-0').textContent).toBe('Nia');
    expect(peachDoc.getElementById('fig-level-0').textContent).toBe('Level 2');
    expect(peachDoc.getElementById('fig-preview-0').src).toBe('/avatars/warrior-f/stand.png');
    expect(peachDoc.getElementById('fig-filled-0').hidden).toBe(false);
    expect(peachDoc.getElementById('fig-empty-0').hidden).toBe(true);
    expect(peachDoc.getElementById('fig-filled-1').hidden).toBe(true);
    expect(peachDoc.getElementById('fig-empty-1').hidden).toBe(false);

    rows = two;
    await resumeFigs(peachDoc as unknown as Document, fetchMock);
    expect(peachDoc.getElementById('fig-name-1').textContent).toBe('Bob');
    expect(peachDoc.getElementById('fig-level-1').textContent).toBe('Level 4');
    expect(peachDoc.getElementById('fig-preview-1').src).toBe('/avatars/warrior-m/stand.png');
    expect(peachDoc.getElementById('fig-filled-0').hidden).toBe(false);
    expect(peachDoc.getElementById('fig-filled-1').hidden).toBe(false);
    expect(peachDoc.getElementById('fig-empty-0').hidden).toBe(true);
    expect(peachDoc.getElementById('fig-empty-1').hidden).toBe(true);
  });

  it('deletes an avatar only on the second click and refreshes the list', async () => {
    const peachDoc = fakeDocument();
    const { fetchMock } = rosterFetch([{ id: 'fig-nia', name: 'Nia', gender: 'woman', level: 3 }]);
    await wireScreens(peachDoc as unknown as Document, fetchMock);
    expect(peachDoc.getElementById('fig-level-0').textContent).toBe('Level 3');

    const del = peachDoc.getElementById('fig-delete-0');
    press(del);
    expect(del.textContent).toBe('Click again to delete');
    expect(callsOf(fetchMock).some((call) => call.method === 'DELETE')).toBe(false);

    press(del);
    await vi.waitFor(() => {
      expect(peachDoc.getElementById('fig-empty-0').hidden).toBe(false);
    });
    const deleted = callsOf(fetchMock).filter((call) => call.method === 'DELETE');
    expect(deleted).toHaveLength(1);
    expect(deleted[0]?.path).toBe('/api/avatars/fig-nia');
    expect(peachDoc.getElementById('fig-filled-0').hidden).toBe(true);
    expect(peachDoc.getElementById('fig-name-0').textContent).toBe('');
    expect(peachDoc.getElementById('fig-level-0').textContent).toBe('');
    expect(peachDoc.getElementById('fig-roster').hidden).toBe(false);
  });

  it('reverts the delete button after the window and does not delete on the next single click', async () => {
    expect(figDeleteWindowMs).toBeGreaterThanOrEqual(3500);
    expect(figDeleteWindowMs).toBeLessThanOrEqual(4500);
    const peachDoc = fakeDocument();
    const { fetchMock } = rosterFetch([{ id: 'fig-nia', name: 'Nia', gender: 'woman', level: 1 }]);
    await wireScreens(peachDoc as unknown as Document, fetchMock);

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const del = peachDoc.getElementById('fig-delete-0');
    press(del);
    expect(del.textContent).toBe('Click again to delete');
    vi.advanceTimersByTime(figDeleteWindowMs - 1);
    expect(del.textContent).toBe('Click again to delete');
    vi.advanceTimersByTime(1);
    expect(del.textContent).toBe('Delete');

    press(del);
    expect(del.textContent).toBe('Click again to delete');
    expect(callsOf(fetchMock).some((call) => call.method === 'DELETE')).toBe(false);
    vi.advanceTimersByTime(figDeleteWindowMs);
    expect(del.textContent).toBe('Delete');
    expect(callsOf(fetchMock).some((call) => call.method === 'DELETE')).toBe(false);
    expect(peachDoc.getElementById('fig-filled-0').hidden).toBe(false);
  });

  it('plays through /api/play then /api/me and reveals the map', async () => {
    const peachDoc = fakeDocument();
    const { fetchMock } = rosterFetch([{ id: 'fig-nia', name: 'Nia', gender: 'woman', level: 1 }]);
    await wireScreens(peachDoc as unknown as Document, fetchMock);

    press(peachDoc.getElementById('fig-play-0'));
    await vi.waitFor(() => {
      expect(peachDoc.getElementById('papaya-canvas').hidden).toBe(false);
    });

    const calls = callsOf(fetchMock);
    const playAt = calls.findIndex((call) => call.path === '/api/play');
    const meAt = calls.findIndex((call) => call.path === '/api/me');
    expect(playAt).toBeGreaterThanOrEqual(0);
    expect(meAt).toBe(playAt + 1);
    expect(calls[playAt]?.method).toBe('POST');
    expect(JSON.parse(String(calls[playAt]?.init.body))).toEqual({ id: 'fig-nia' });
    expect(calls[meAt]?.method).toBe('GET');
    expect(peachDoc.getElementById('kiwi-zoom').hidden).toBe(false);
    expect(peachDoc.getElementById('apple-login').hidden).toBe(true);
    expect(peachDoc.getElementById('fig-roster').hidden).toBe(true);
    expect(peachDoc.getElementById('fig-plant').hidden).toBe(true);
  });

  it('skips the sign-in screen when /api/avatars answers 200', async () => {
    const peachDoc = fakeDocument();
    const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
      expect(init?.method ?? 'GET').toBe('GET');
      expect(path).toBe('/api/avatars');
      return jsonResponse(200, [{ id: 'fig-back', name: 'Lina', gender: 'woman', level: 5 }]);
    });

    await wireScreens(peachDoc as unknown as Document, fetchMock);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(peachDoc.getElementById('apple-login').hidden).toBe(true);
    expect(peachDoc.getElementById('fig-roster').hidden).toBe(false);
    expect(peachDoc.getElementById('fig-plant').hidden).toBe(true);
    expect(peachDoc.getElementById('fig-name-0').textContent).toBe('Lina');
    expect(peachDoc.getElementById('fig-level-0').textContent).toBe('Level 5');
    expect(peachDoc.getElementById('papaya-canvas').hidden).toBe(true);
    expect(peachDoc.getElementById('kiwi-zoom').hidden).toBe(true);
  });

  it('signs out and returns to the sign-in screen', async () => {
    const peachDoc = fakeDocument();
    const { fetchMock } = rosterFetch([{ id: 'fig-nia', name: 'Nia', gender: 'man', level: 1 }]);
    await wireScreens(peachDoc as unknown as Document, fetchMock);
    peachDoc.getElementById('kiwi-user').value = 'ada_fig';
    peachDoc.getElementById('kiwi-pass').value = 'leftover-secret';

    const preventDefault = press(peachDoc.getElementById('fig-signout'));
    expect(preventDefault).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => {
      expect(peachDoc.getElementById('apple-login').hidden).toBe(false);
    });

    const signedOut = callsOf(fetchMock).filter((call) => call.path === '/api/signout');
    expect(signedOut).toHaveLength(1);
    expect(signedOut[0]?.method).toBe('POST');
    expect(signedOut[0]?.init.body).toBeUndefined();
    expect(peachDoc.getElementById('fig-roster').hidden).toBe(true);
    expect(peachDoc.getElementById('kiwi-pass').value).toBe('');
    expect(peachDoc.getElementById('kiwi-user').value).toBe('');
    expect(peachDoc.getElementById('papaya-canvas').hidden).toBe(true);
  });
});
