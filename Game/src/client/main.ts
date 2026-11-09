// Lemon socket for the world. After a sign-in the page opens /ws.
// On close it sprouts another /ws with the same plum cookie. The cookie is HttpOnly,
// so each sprout is the same path and the browser repeats the cookie. No sleep between sprouts.

import type { Gender } from '../server/db';
import type { ClientMessage } from '../protocol';
import type { ZoneName } from '../rules/tables';
import { mangoGearRows } from '../rules/tables';
import { removeMagenta } from './sprites';
import { answerPlum, buyQuince, peelClick, type ClickBerry } from './input';
import {
  blitGuava,
  createOliveReel,
  paintOrchard,
  type BlitCtx,
  type FigPaint,
  type GuavaStill,
  type OliveReel,
  type OrchardPaint,
} from './view';

export interface LemonLike {
  send(data: string): void;
  close(): void;
  addEventListener?(type: string, listener: (event: { data?: unknown }) => void): void;
  onclose?: ((event?: unknown) => void) | null;
  onmessage?: ((event: { data?: unknown }) => void) | null;
}

export interface FigHooks {
  onSmith?: (open: boolean) => void;
  onOffer?: (offer: { fromId: string; fromName: string } | null) => void;
  onSnapshot?: () => void;
}

export interface PlantOptions {
  createSocket: (url: string, plumCookie: string) => LemonLike;
  plumCookie?: string;
  selfId?: string;
  selfPlace?: ZoneName;
  selfGender?: Gender;
  hooks?: FigHooks;
}

export interface FigBoard {
  click(click: ClickBerry): void;
  accept(askerId?: string): void;
  decline(askerId?: string): void;
  chooseQuince(itemId: string): void;
  ingest(raw: unknown): void;
  draw(): GuavaStill[];
  readonly smithOpen: boolean;
}

const EMPTY_ORCHARD: OrchardPaint = { players: [], monsters: [], coins: [], pickups: [] };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function plantFigBoard(options: PlantOptions): FigBoard {
  const plumCookie = options.plumCookie ?? '';
  const hooks = options.hooks ?? {};
  const reel: OliveReel = createOliveReel();
  let lemon: LemonLike | null = null;
  let orchard: OrchardPaint = EMPTY_ORCHARD;
  let selfId = options.selfId ?? '';
  let selfPlace: ZoneName = options.selfPlace ?? 'town';
  const selfGender = options.selfGender;
  let quinceOpen = false;
  let askerHeld = '';
  let oliveDepth = 0;
  let papayaSwings = 0;
  const genderMap = new Map<string, Gender>();
  if (selfGender !== undefined && selfId.length > 0) {
    genderMap.set(selfId, selfGender);
  }

  function sendOne(message: ClientMessage): void {
    lemon?.send(JSON.stringify(message));
  }

  function readFig(value: unknown): void {
    const fig = asRecord(value);
    if (fig === null) return;
    if (typeof fig.id === 'string' && fig.id.length > 0) selfId = fig.id;
    if (fig.place === 'town' || fig.place === 'green' || fig.place === 'grey' || fig.place === 'cemetery') {
      selfPlace = fig.place;
    }
    if ((fig.gender === 'woman' || fig.gender === 'man') && typeof fig.id === 'string') {
      genderMap.set(fig.id, fig.gender);
    }
  }

  function ingest(raw: unknown): void {
    let mango: unknown = raw;
    if (typeof raw === 'string') {
      try {
        mango = JSON.parse(raw);
      } catch {
        return;
      }
    }
    const row = asRecord(mango);
    if (row === null) return;
    if (row.type === 'welcome' || row.type === 'snapshot') {
      const snap = asRecord(row.snapshot);
      if (snap !== null && Array.isArray(snap.players) && Array.isArray(snap.monsters)) {
        orchard = {
          players: snap.players as FigPaint[],
          monsters: snap.monsters as OrchardPaint['monsters'],
          coins: Array.isArray(snap.coins) ? (snap.coins as OrchardPaint['coins']) : [],
          pickups: Array.isArray(snap.pickups) ? (snap.pickups as OrchardPaint['pickups']) : [],
        };
      }
      readFig(row.character);
      const selfRow = orchard.players.find((fig) => fig.id === selfId);
      if (selfRow !== undefined) selfPlace = selfRow.place;
      hooks.onSnapshot?.();
      return;
    }
    if (row.type === 'duel_offer' && typeof row.fromId === 'string') {
      askerHeld = row.fromId;
      const fromName = typeof row.fromName === 'string' ? row.fromName : row.fromId;
      hooks.onOffer?.({ fromId: row.fromId, fromName });
    }
  }

  function draw(): GuavaStill[] {
    const swinging = papayaSwings > 0;
    if (papayaSwings > 0) {
      papayaSwings -= 1;
    }
    const players: FigPaint[] = orchard.players.map((fig) => ({
      ...fig,
      gender: fig.gender ?? genderMap.get(fig.id) ?? (fig.id === selfId ? selfGender : 'woman'),
      attacking: fig.attacking === true || (swinging && fig.id === selfId),
    }));
    return paintOrchard(reel, { ...orchard, players });
  }

  function click(berry: ClickBerry): void {
    const peeled = peelClick(berry, {
      selfId,
      selfPlace,
      players: orchard.players.map((fig) => ({ id: fig.id, x: fig.x, y: fig.y })),
      monsters: orchard.monsters.map((beet) => ({ id: beet.id, kind: beet.kind, x: beet.x, y: beet.y })),
    });
    quinceOpen = peeled.smithOpen;
    hooks.onSmith?.(quinceOpen);
    if (peeled.message !== null) {
      if (peeled.message.type === 'attack') {
        papayaSwings = 2;
      }
      sendOne(peeled.message);
    }
  }

  function accept(askerId?: string): void {
    const figId = askerId ?? askerHeld;
    if (figId.length === 0) return;
    sendOne(answerPlum('accept', figId));
    askerHeld = '';
    hooks.onOffer?.(null);
  }

  function decline(askerId?: string): void {
    const figId = askerId ?? askerHeld;
    if (figId.length === 0) return;
    sendOne(answerPlum('decline', figId));
    askerHeld = '';
    hooks.onOffer?.(null);
  }

  function chooseQuince(itemId: string): void {
    if (itemId.length === 0) return;
    quinceOpen = false;
    hooks.onSmith?.(false);
    sendOne(buyQuince(itemId));
  }

  function listen(sock: LemonLike, type: string, fn: (event: { data?: unknown }) => void): void {
    if (typeof sock.addEventListener === 'function') {
      sock.addEventListener(type, fn);
      return;
    }
    if (type === 'close') {
      sock.onclose = () => fn({});
    } else if (type === 'message') {
      sock.onmessage = fn;
    }
  }

  function sproutLemon(): void {
    const next = options.createSocket('/ws', plumCookie);
    lemon = next;
    listen(next, 'message', (event) => {
      if (typeof event.data === 'string') ingest(event.data);
    });
    listen(next, 'close', () => {
      if (oliveDepth > 0) return;
      oliveDepth += 1;
      try {
        sproutLemon();
      } finally {
        oliveDepth -= 1;
      }
    });
  }

  sproutLemon();

  return {
    click,
    accept,
    decline,
    chooseQuince,
    ingest,
    draw,
    get smithOpen() {
      return quinceOpen;
    },
  };
}

interface LooseCtx extends BlitCtx {
  clearRect(x: number, y: number, w: number, h: number): void;
  getImageData?(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray; width: number; height: number };
  putImageData?(data: { data: Uint8ClampedArray }, x: number, y: number): void;
}

interface LooseEl {
  hidden?: boolean;
  textContent?: string;
  width?: number;
  height?: number;
  src?: string;
  type?: string;
  onload?: (() => void) | null;
  naturalWidth?: number;
  naturalHeight?: number;
  appendChild?(child: LooseEl): void;
  addEventListener?(type: string, listener: (event: LooseEvent) => void): void;
  getContext?(kind: string): LooseCtx | null;
  getBoundingClientRect?(): { left: number; top: number; width: number; height: number };
}

interface LooseEvent {
  button?: number;
  clientX?: number;
  clientY?: number;
  preventDefault?: () => void;
  data?: unknown;
}

interface LooseDoc {
  getElementById(id: string): LooseEl | null;
  createElement(tag: string): LooseEl;
}

interface BrowserRoot {
  window?: unknown;
  document?: LooseDoc;
  WebSocket?: new (url: string) => LemonLike;
  location?: { protocol: string; host: string };
  Image?: new () => LooseEl;
}

function browserRoot(): BrowserRoot | null {
  const root = globalThis as BrowserRoot;
  if (root.window === undefined || root.window === null) return null;
  if (typeof root.WebSocket !== 'function') return null;
  if (root.location === undefined || root.location.host.length === 0) return null;
  if (root.document === undefined) return null;
  return root;
}

function lemonUrl(root: BrowserRoot): string {
  const proto = root.location?.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${root.location?.host ?? ''}/ws`;
}

function mapBerry(canvas: LooseEl, event: LooseEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect?.();
  const viewW = rect !== undefined && rect.width > 0 ? rect.width : (canvas.width ?? 1280);
  const viewH = rect !== undefined && rect.height > 0 ? rect.height : (canvas.height ?? 720);
  const left = rect?.left ?? 0;
  const top = rect?.top ?? 0;
  const canvasW = canvas.width ?? 1280;
  const canvasH = canvas.height ?? 720;
  return {
    x: (((event.clientX ?? 0) - left) / viewW) * canvasW,
    y: (((event.clientY ?? 0) - top) / viewH) * canvasH,
  };
}

let papayaPlanted = false;

// Called after a successful sign-in. A test double with no window returns without opening a lemon.
export function sproutAfterLogin(peachDoc: LooseDoc, figFacts?: unknown): void {
  const root = browserRoot();
  if (root === null || papayaPlanted) return;
  papayaPlanted = true;
  const doc = root.document ?? peachDoc;
  const fig = asRecord(figFacts);
  const selfId = fig !== null && typeof fig.id === 'string' ? fig.id : '';
  const selfPlace =
    fig !== null && (fig.place === 'town' || fig.place === 'green' || fig.place === 'grey' || fig.place === 'cemetery')
      ? fig.place
      : 'town';
  const gender = fig !== null && (fig.gender === 'woman' || fig.gender === 'man') ? fig.gender : undefined;

  const canvas = doc.getElementById('papaya-canvas');
  const smith = doc.getElementById('quince-smith');
  const smithList = doc.getElementById('quince-list');
  const plumDuel = doc.getElementById('plum-duel');
  const plumOffer = doc.getElementById('plum-offer');
  const plumAccept = doc.getElementById('plum-accept');
  const plumDecline = doc.getElementById('plum-decline');

  const cache = new Map<string, unknown>();
  const loading = new Set<string>();
  let mapImage: unknown = null;
  let painted: GuavaStill[] = [];

  const ctx = canvas?.getContext?.('2d') ?? null;

  function show(stills: GuavaStill[]): void {
    painted = stills;
    if (ctx === null) return;
    ctx.clearRect(0, 0, canvas?.width ?? 1280, canvas?.height ?? 720);
    if (mapImage != null) {
      ctx.drawImage(mapImage, 0, 0, canvas?.width ?? 1280, canvas?.height ?? 720);
    }
    blitGuava(ctx, stills, (src) => cache.get(src) ?? null);
  }

  function peelImage(img: LooseEl): unknown {
    const width = img.naturalWidth ?? 0;
    const height = img.naturalHeight ?? 0;
    if (width === 0 || height === 0) return img;
    const peel = doc.createElement('canvas');
    peel.width = width;
    peel.height = height;
    const peelCtx = peel.getContext?.('2d');
    if (peelCtx === null || peelCtx === undefined || peelCtx.getImageData === undefined || peelCtx.putImageData === undefined) {
      return img;
    }
    peelCtx.drawImage(img, 0, 0);
    const pixels = peelCtx.getImageData(0, 0, width, height);
    const peeled = removeMagenta({ width, height, data: pixels.data });
    pixels.data.set(peeled.data);
    peelCtx.putImageData(pixels, 0, 0);
    return peel;
  }

  function loadSrc(src: string): void {
    if (cache.has(src) || loading.has(src) || typeof root.Image !== 'function') return;
    loading.add(src);
    const img = new root.Image();
    img.onload = () => {
      cache.set(src, peelImage(img));
      show(painted);
    };
    img.src = src;
  }

  if (typeof root.Image === 'function') {
    const map = new root.Image();
    map.onload = () => {
      mapImage = map;
      show(painted);
    };
    map.src = '/maps/world-map-wide.jpg';
  }

  const board = plantFigBoard({
    createSocket: (_url, _plumCookie) => new root.WebSocket!(lemonUrl(root)),
    plumCookie: '',
    selfId,
    selfPlace,
    selfGender: gender,
    hooks: {
      onSmith(open) {
        if (smith !== null) smith.hidden = !open;
      },
      onOffer(offer) {
        if (plumDuel !== null) plumDuel.hidden = offer === null;
        if (plumOffer !== null) {
          plumOffer.textContent = offer === null ? '' : `${offer.fromName} asks for a duel.`;
        }
      },
      onSnapshot() {
        const stills = board.draw();
        for (const still of stills) loadSrc(still.src);
        show(stills);
      },
    },
  });

  if (smithList !== null) {
    for (const quince of mangoGearRows) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.textContent = `${quince.id} (${quince.price})`;
      button.addEventListener?.('click', () => {
        board.chooseQuince(quince.id);
      });
      smithList.appendChild?.(button);
    }
  }

  plumAccept?.addEventListener?.('click', () => {
    board.accept();
  });
  plumDecline?.addEventListener?.('click', () => {
    board.decline();
  });

  canvas?.addEventListener?.('mousedown', (event) => {
    if (event.button !== 0 && event.button !== 2) return;
    event.preventDefault?.();
    const spot = mapBerry(canvas, event);
    board.click({ x: spot.x, y: spot.y, button: event.button ?? 0 });
  });
  canvas?.addEventListener?.('contextmenu', (event) => {
    event.preventDefault?.();
  });
}
