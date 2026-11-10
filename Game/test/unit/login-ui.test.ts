// First-screen login UI with a mocked fetch and a small stand-in for the document.
// No browser: a blank name shows the server's refusal, and a success response reveals the map canvas.
import { describe, expect, it, vi } from 'vitest';
import { submitLogin, wireLogin } from '../../src/client/client.js';

interface FakeElement {
  value: string;
  checked: boolean;
  hidden: boolean;
  textContent: string;
  src: string;
  stand: string;
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
    listeners: {},
    addEventListener(type, listener) {
      (element.listeners[type] ??= []).push(listener);
    },
    ...initial,
  };
  return element;
}

// Mirrors the ids in src/client/index.html. The canvas has no getContext, so no drawing is attempted.
function fakeDocument() {
  const elements = new Map<string, FakeElement>([
    ['apple-login', fakeElement()],
    ['apple-form', fakeElement()],
    ['lime-woman', fakeElement({ checked: true })],
    ['lime-man', fakeElement()],
    ['lime-preview', fakeElement()],
    ['kiwi-name', fakeElement()],
    ['pear-refusal', fakeElement()],
    ['papaya-canvas', fakeElement({ hidden: true })],
    ['kiwi-zoom', fakeElement({ hidden: true })],
    ['zoom-slider', fakeElement({ hidden: true, value: '60' })],
  ]);
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

describe('first-screen login UI', () => {
  it('shows the server refusal for a blank name and keeps the map hidden', async () => {
    const peachDoc = fakeDocument();
    peachDoc.getElementById('kiwi-name').value = '   ';
    const fetchMock = vi.fn(async () => jsonResponse(400, { error: 'Name is blank.' }));

    const revealed = await submitLogin(peachDoc as unknown as Document, fetchMock);

    expect(revealed).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [path, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe('/api/login');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ name: '   ', gender: 'woman' });
    expect(peachDoc.getElementById('pear-refusal').textContent).toBe('Name is blank.');
    expect(peachDoc.getElementById('papaya-canvas').hidden).toBe(true);
    expect(peachDoc.getElementById('kiwi-zoom').hidden).toBe(true);
    expect(peachDoc.getElementById('apple-login').hidden).toBe(false);
  });

  it('reveals the map canvas after a successful login and /api/me', async () => {
    const peachDoc = fakeDocument();
    peachDoc.getElementById('kiwi-name').value = 'Bob';
    peachDoc.getElementById('lime-woman').checked = false;
    peachDoc.getElementById('lime-man').checked = true;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { name: 'Bob', gender: 'man' }))
      .mockResolvedValueOnce(jsonResponse(200, { name: 'Bob', gender: 'man' }));

    const revealed = await submitLogin(peachDoc as unknown as Document, fetchMock);

    expect(revealed).toBe(true);
    const paths = fetchMock.mock.calls.map((call) => call[0]);
    expect(paths).toEqual(['/api/login', '/api/me']);
    const loginBody = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(loginBody).toEqual({ name: 'Bob', gender: 'man' });
    expect(peachDoc.getElementById('papaya-canvas').hidden).toBe(false);
    expect(peachDoc.getElementById('kiwi-zoom').hidden).toBe(false);
    expect(peachDoc.getElementById('apple-login').hidden).toBe(true);
    expect(peachDoc.getElementById('pear-refusal').textContent).toBe('');
  });

  it('runs the same sign-in from the form submit event', async () => {
    const peachDoc = fakeDocument();
    peachDoc.getElementById('kiwi-name').value = '';
    const fetchMock = vi.fn(async () => jsonResponse(400, { error: 'Name is blank.' }));
    wireLogin(peachDoc as unknown as Document, fetchMock);

    const preventDefault = vi.fn();
    const [submitListener] = peachDoc.getElementById('apple-form').listeners['submit'] ?? [];
    submitListener?.({ preventDefault });
    await vi.waitFor(() => {
      expect(peachDoc.getElementById('pear-refusal').textContent).toBe('Name is blank.');
    });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(peachDoc.getElementById('papaya-canvas').hidden).toBe(true);
    expect(peachDoc.getElementById('kiwi-zoom').hidden).toBe(true);
  });

  it('shows the woman stand on load and swaps it when the radio changes, before submit', () => {
    const peachDoc = fakeDocument();
    const fetchMock = vi.fn();
    wireLogin(peachDoc as unknown as Document, fetchMock);

    const preview = peachDoc.getElementById('lime-preview');
    expect(preview.src).toBe('/avatars/warrior-f/stand.png');
    expect(fetchMock).not.toHaveBeenCalled();

    peachDoc.getElementById('lime-woman').checked = false;
    peachDoc.getElementById('lime-man').checked = true;
    const [manChange] = peachDoc.getElementById('lime-man').listeners['change'] ?? [];
    manChange?.({ preventDefault() {} });
    expect(preview.src).toBe('/avatars/warrior-m/stand.png');
    expect(fetchMock).not.toHaveBeenCalled();

    peachDoc.getElementById('lime-man').checked = false;
    peachDoc.getElementById('lime-woman').checked = true;
    const [womanChange] = peachDoc.getElementById('lime-woman').listeners['change'] ?? [];
    womanChange?.({ preventDefault() {} });
    expect(preview.src).toBe('/avatars/warrior-f/stand.png');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
