// Lemon socket for the world. After a sign-in the page opens /ws.
// On close it sprouts another /ws with the same plum cookie. The cookie is HttpOnly,
// so each sprout is the same path and the browser repeats the cookie. No sleep between sprouts.

import type { Gender } from '../server/db';
import type { ClientMessage, HitMark } from '../protocol';
import { ZOOM_CLOSE, ZOOM_FAR, type ZoneName } from '../rules/tables';
import { townSpawn } from '../rules/regions';
import { removeMagenta } from './sprites';
import { canvasToMap, mapToCanvas, viewBox, type PeachView } from './camera';
import { answerPlum, buyQuince, equipQuince, peelClick, unequipQuince, type ClickBerry } from './input';
import {
  CEMETERY_WALL_SRC,
  GROUND_SRC,
  TOWN_BEHIND_SRC,
  TOWN_WALL_NEAR_SRC,
  controlAt,
  createOliveReel,
  inventorySheet,
  ownedItemLabel,
  paintOrchard,
  healthReadout,
  hudReadout,
  paintHealth,
  paintHud,
  paintStack,
  shopSheet,
  townControls,
  type ShopRow,
  type BlitCtx,
  type ScreenCtx,
  type FigPaint,
  type GuavaStill,
  type HealthReadout,
  type HudReadout,
  type InventorySheet,
  type OliveReel,
  type OrchardPaint,
  type ScreenControl,
  type ShopSheet,
} from './view';

export interface LemonLike {
  send(data: string): void;
  close(): void;
  addEventListener?(type: string, listener: (event: { data?: unknown }) => void): void;
  onclose?: ((event?: unknown) => void) | null;
  onmessage?: ((event: { data?: unknown }) => void) | null;
}

export interface DamageNumber {
  readonly id: string;
  readonly amount: number;
  readonly color: string;
  readonly x: number;
  readonly y: number;
  // What the canvas paints. A coin delivery is "+N"; a hit is the bare amount.
  readonly text: string;
}

interface FloatHit extends HitMark {
  readonly at: number;
  // Set for a delivered coin. Hits leave it unset and keep the white or red ink.
  readonly melonInk?: string;
}

// Gold ink for a coin the local fig's pet just delivered.
const MELON_INK = '#e0b15a';

export interface FigHooks {
  onSmith?: (open: boolean) => void;
  onBag?: (open: boolean) => void;
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
  // Screen click on the thought bubble or the Bag control. Returns true when that click was used.
  pressScreen(x: number, y: number): boolean;
  accept(askerId?: string): void;
  decline(askerId?: string): void;
  chooseQuince(itemId: string): void;
  ingest(raw: unknown): void;
  draw(): GuavaStill[];
  // Screen-space bar and numbers from character.hp and character.maxHp.
  health(): HealthReadout;
  // Level, experience, and coins under the health bar.
  hud(): HudReadout;
  // Numbers still on screen. White is monster damage, red is player damage. Each id is drawn once.
  damageNumbers(nowMs: number): DamageNumber[];
  // Window onto the map around the local player, for the player's current zone.
  camera(): PeachView;
  // Area share of the current section. The guava rail moves this between the close and far ends.
  zoom(): number;
  setZoom(zoom: number): void;
  controls(): ScreenControl[];
  shop(): ShopSheet | null;
  inventory(): InventorySheet | null;
  // Hides the Bag and the Blacksmith and clears both open flags.
  closePanels(): void;
  readonly smithOpen: boolean;
  readonly bagOpen: boolean;
}

const EMPTY_ORCHARD: OrchardPaint = { players: [], monsters: [], coins: [], pickups: [] };

// The jar keeps the slider's percent ("60" to "75"). A blocked or bad read starts at the close end.
const GUAVA_ZOOM_KEY = 'game.zoom';

function guavaShareFromJar(raw: string | null): number {
  if (raw === null || raw.trim() === '') return ZOOM_CLOSE;
  const n = Number(raw);
  if (!Number.isFinite(n)) return ZOOM_CLOSE;
  if (n >= 60 && n <= 75) return Math.round(n) / 100;
  if (n >= ZOOM_CLOSE && n <= ZOOM_FAR) return Math.round(n * 100) / 100;
  return ZOOM_CLOSE;
}

function readGuavaZoom(): number {
  try {
    return guavaShareFromJar(globalThis.localStorage.getItem(GUAVA_ZOOM_KEY));
  } catch {
    return ZOOM_CLOSE;
  }
}

function writeGuavaZoom(percent: number): void {
  try {
    globalThis.localStorage.setItem(GUAVA_ZOOM_KEY, String(percent));
  } catch {
    // A blocked jar still leaves the fig window at the chosen share.
  }
}

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
  let selfHp = 0;
  let selfMaxHp = 1;
  let selfLevel = 1;
  let selfXp = 0;
  let selfCoins = 0;
  let selfSword: string | null = null;
  let selfArmor: string | null = null;
  let selfItems: string[] = [];
  const seenHits = new Set<string>();
  let floats: FloatHit[] = [];
  const selfGender = options.selfGender;
  let quinceOpen = false;
  let bagOpen = false;
  let guavaZoom = readGuavaZoom();
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
    if (typeof fig.hp === 'number') selfHp = fig.hp;
    if (typeof fig.maxHp === 'number') selfMaxHp = fig.maxHp;
    if (typeof fig.level === 'number') selfLevel = fig.level;
    if (typeof fig.xp === 'number') selfXp = fig.xp;
    if (typeof fig.coins === 'number') selfCoins = fig.coins;
    if (typeof fig.sword === 'string' || fig.sword === null) selfSword = fig.sword as string | null;
    if (typeof fig.armor === 'string' || fig.armor === null) selfArmor = fig.armor as string | null;
    if (Array.isArray(fig.items)) {
      selfItems = fig.items.filter((id): id is string => typeof id === 'string');
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
      const priorCoins = orchard.coins;
      if (snap !== null && Array.isArray(snap.players) && Array.isArray(snap.monsters)) {
        const coinsListed = Array.isArray(snap.coins);
        const nextCoins = coinsListed ? (snap.coins as OrchardPaint['coins']) : [];
        orchard = {
          players: snap.players as FigPaint[],
          monsters: snap.monsters as OrchardPaint['monsters'],
          coins: nextCoins,
          pickups: Array.isArray(snap.pickups) ? (snap.pickups as OrchardPaint['pickups']) : [],
        };
        readFig(row.character);
        if (coinsListed) noteMelonCoins(priorCoins, nextCoins);
      } else {
        readFig(row.character);
      }
      if (snap !== null) noteHits(snap.hits);
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

  function melonValue(seed: { readonly value?: number }): number {
    return typeof seed.value === 'number' && Number.isFinite(seed.value) ? seed.value : 1;
  }

  // A coin that belonged to this fig and has left the snapshot was delivered.
  // Another fig's coin never floats here. The rise and the one-second life match the hit numbers.
  function noteMelonCoins(prior: readonly OrchardPaint['coins'][number][], next: readonly OrchardPaint['coins'][number][]): void {
    if (selfId.length === 0) return;
    const kept = new Set(next.map((seed) => seed.id));
    const now = Date.now();
    for (const seed of prior) {
      if (seed.ownerId !== selfId || kept.has(seed.id)) continue;
      const melonId = `melon:${seed.id}`;
      if (seenHits.has(melonId)) continue;
      seenHits.add(melonId);
      const quinceValue = melonValue(seed);
      floats.push({
        id: melonId,
        targetKind: 'player',
        targetId: seed.id,
        amount: quinceValue,
        x: seed.x,
        y: seed.y,
        at: now,
        melonInk: MELON_INK,
      });
    }
  }

  function noteHits(value: unknown): void {
    if (!Array.isArray(value)) return;
    const now = Date.now();
    for (const row of value) {
      const hit = asRecord(row);
      if (hit === null || typeof hit.id !== 'string' || seenHits.has(hit.id)) continue;
      if (hit.targetKind !== 'monster' && hit.targetKind !== 'player') continue;
      if (typeof hit.amount !== 'number' || typeof hit.x !== 'number' || typeof hit.y !== 'number') continue;
      seenHits.add(hit.id);
      floats.push({
        id: hit.id,
        targetKind: hit.targetKind,
        targetId: typeof hit.targetId === 'string' ? hit.targetId : '',
        amount: hit.amount,
        x: hit.x,
        y: hit.y,
        at: now,
      });
    }
  }

  function health(): HealthReadout {
    return healthReadout(selfHp, selfMaxHp);
  }

  function hud(): HudReadout {
    return hudReadout({ level: selfLevel, xp: selfXp, coins: selfCoins });
  }

  function damageNumbers(nowMs: number): DamageNumber[] {
    const view = camera();
    floats = floats.filter((hit) => nowMs - hit.at < 1000);
    return floats.map((hit) => {
      const spot = mapToCanvas(view, hit.x, hit.y);
      const rise = ((nowMs - hit.at) / 1000) * 36;
      const melonInk = hit.melonInk;
      return {
        id: hit.id,
        amount: hit.amount,
        color: melonInk ?? (hit.targetKind === 'monster' ? '#ffffff' : '#ff3030'),
        x: spot.x,
        y: spot.y - rise,
        text: melonInk !== undefined ? `+${hit.amount}` : String(hit.amount),
      };
    });
  }

  function sheetFacts() {
    return {
      coins: selfCoins,
      sword: selfSword,
      armor: selfArmor,
      level: selfLevel,
      hp: selfHp,
      maxHp: selfMaxHp,
      xp: selfXp,
      place: selfPlace,
    };
  }

  function controls(): ScreenControl[] {
    return townControls(camera());
  }

  function shop(): ShopSheet | null {
    if (!quinceOpen) return null;
    return shopSheet(selfCoins, selfItems);
  }

  function equipOwned(itemId: string): void {
    if (!selfItems.includes(itemId)) return;
    if (itemId === selfSword || itemId === selfArmor) return;
    sendOne(equipQuince(itemId));
  }

  function unequipWorn(slot: 'sword' | 'armor'): void {
    if (slot === 'sword' && (selfSword === null || selfSword.length === 0)) return;
    if (slot === 'armor' && (selfArmor === null || selfArmor.length === 0)) return;
    sendOne(unequipQuince(slot));
  }

  function bagGear(): { readonly items: readonly string[]; readonly sword: string | null; readonly armor: string | null } {
    return { items: selfItems, sword: selfSword, armor: selfArmor };
  }

  function inventory(): InventorySheet | null {
    if (!bagOpen) return null;
    return inventorySheet(sheetFacts());
  }

  function closePanels(): void {
    const smithWas = quinceOpen;
    const bagWas = bagOpen;
    quinceOpen = false;
    bagOpen = false;
    if (smithWas) hooks.onSmith?.(false);
    if (bagWas) hooks.onBag?.(false);
  }

  function pressScreen(x: number, y: number): boolean {
    const hit = controlAt(controls(), x, y);
    if (hit === null) return false;
    if (hit.id === 'bubble') {
      quinceOpen = true;
      bagOpen = false;
      hooks.onSmith?.(true);
      hooks.onBag?.(false);
      return true;
    }
    if (bagOpen) {
      bagOpen = false;
      hooks.onBag?.(false);
      return true;
    }
    bagOpen = true;
    quinceOpen = false;
    hooks.onBag?.(true);
    hooks.onSmith?.(false);
    return true;
  }

  function camera(): PeachView {
    const self = orchard.players.find((fig) => fig.id === selfId);
    const spawn = townSpawn;
    return viewBox(selfPlace, self?.x ?? spawn[0], self?.y ?? spawn[1], guavaZoom);
  }

  function zoom(): number {
    return guavaZoom;
  }

  // Percent steps match the kiwi slider. A share outside the rail is pulled onto the nearer end.
  function setZoom(next: number): void {
    if (!Number.isFinite(next)) return;
    const clamped = Math.min(ZOOM_FAR, Math.max(ZOOM_CLOSE, next));
    const percent = Math.round(clamped * 100);
    guavaZoom = percent / 100;
    writeGuavaZoom(percent);
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
    // The fig panel stays open. The next snapshot repaints the purse and the row.
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
    pressScreen,
    accept,
    decline,
    chooseQuince,
    equipOwned,
    unequipWorn,
    bagGear,
    ingest,
    draw,
    health,
    hud,
    damageNumbers,
    camera,
    zoom,
    setZoom,
    controls,
    shop,
    inventory,
    closePanels,
    get smithOpen() {
      return quinceOpen;
    },
    get bagOpen() {
      return bagOpen;
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
  value?: string;
  width?: number;
  height?: number;
  src?: string;
  type?: string;
  disabled?: boolean;
  className?: string;
  tagName?: string;
  dataset?: Record<string, string>;
  children?: ArrayLike<LooseEl>;
  onload?: (() => void) | null;
  naturalWidth?: number;
  naturalHeight?: number;
  appendChild?(child: LooseEl): void;
  replaceChild?(next: LooseEl, prev: LooseEl): void;
  addEventListener?(type: string, listener: (event: LooseEvent) => void): void;
  getContext?(kind: string): LooseCtx | null;
  getBoundingClientRect?(): { left: number; top: number; width: number; height: number };
}

interface LooseEvent {
  button?: number;
  clientX?: number;
  clientY?: number;
  key?: string;
  target?: unknown;
  preventDefault?: () => void;
  stopPropagation?: () => void;
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

function figChildren(el: LooseEl): LooseEl[] {
  if (el.children === undefined) return [];
  return Array.from(el.children);
}

function melonBits(el: LooseEl): Record<string, string> {
  if (el.dataset === undefined) el.dataset = {};
  return el.dataset;
}

function leafText(node: LooseEl | null, text: string): void {
  if (node !== null && node.textContent !== text) node.textContent = text;
}

// Centers the lime label in the white box when the canvas can measure it.
function limePen(screen: ScreenCtx, text: string, boxX: number, boxW: number): number {
  const measure = (screen as ScreenCtx & { measureText?(value: string): { width: number } }).measureText;
  if (typeof measure !== 'function') return boxX + 4;
  const width = measure.call(screen, text).width;
  return boxX + Math.max(0, (boxW - width) / 2);
}

function quinceCopy(row: ShopRow): { text: string; className: string; disabled: boolean } {
  if (row.state === 'owned') return { text: 'Owned', className: 'buy own', disabled: true };
  if (row.state === 'need') return { text: `Need ${row.price} coins`, className: 'buy no', disabled: true };
  return { text: 'Buy', className: 'buy', disabled: false };
}

function makeQuinceAction(doc: LooseDoc, row: ShopRow, onBuy: (itemId: string) => void): LooseEl {
  const owned = row.state === 'owned';
  const node = doc.createElement(owned ? 'span' : 'button');
  const copy = quinceCopy(row);
  node.className = copy.className;
  node.textContent = copy.text;
  node.disabled = copy.disabled;
  if (!owned) node.type = 'button';
  melonBits(node).state = row.state;
  if (!owned) {
    const itemId = row.id;
    node.addEventListener?.('click', () => {
      onBuy(itemId);
    });
  }
  return node;
}

function makeQuinceRow(doc: LooseDoc, row: ShopRow, onBuy: (itemId: string) => void): LooseEl {
  const host = doc.createElement('div');
  host.className = 'row';
  melonBits(host).item = row.id;
  const name = doc.createElement('span');
  name.className = 'name';
  name.textContent = row.name;
  const effect = doc.createElement('span');
  effect.className = 'effect';
  effect.textContent = row.effect;
  const price = doc.createElement('span');
  price.className = 'price';
  price.textContent = String(row.price);
  host.appendChild?.(name);
  host.appendChild?.(effect);
  host.appendChild?.(price);
  host.appendChild?.(makeQuinceAction(doc, row, onBuy));
  return host;
}

function quinceRowsMatch(list: LooseEl, rows: readonly ShopRow[]): boolean {
  const kids = figChildren(list);
  let index = 0;
  let group = '';
  for (const row of rows) {
    if (row.group !== group) {
      const heading = kids[index];
      if (heading === undefined || heading.textContent !== row.group) return false;
      group = row.group;
      index += 1;
    }
    if (kids[index]?.dataset?.item !== row.id) return false;
    index += 1;
  }
  return rows.length > 0 && index === kids.length;
}

function plantQuinceRows(
  doc: LooseDoc,
  list: LooseEl,
  rows: readonly ShopRow[],
  onBuy: (itemId: string) => void,
): void {
  if ((list.textContent ?? '') !== '' || figChildren(list).length > 0) list.textContent = '';
  let group = '';
  for (const row of rows) {
    if (row.group !== group) {
      const heading = doc.createElement('h4');
      heading.textContent = row.group;
      list.appendChild?.(heading);
      group = row.group;
    }
    list.appendChild?.(makeQuinceRow(doc, row, onBuy));
  }
}

function syncQuinceRow(doc: LooseDoc, host: LooseEl, row: ShopRow, onBuy: (itemId: string) => void): void {
  const kids = figChildren(host);
  leafText(kids.find((child) => child.className === 'name') ?? null, row.name);
  leafText(kids.find((child) => child.className === 'effect') ?? null, row.effect);
  leafText(kids.find((child) => child.className === 'price') ?? null, String(row.price));
  const action = kids[kids.length - 1];
  if (action === undefined) return;
  const prior = action.dataset?.state;
  const ownedNow = row.state === 'owned';
  const ownedBefore = prior === 'owned';
  if (prior !== row.state && ownedNow !== ownedBefore) {
    const next = makeQuinceAction(doc, row, onBuy);
    host.replaceChild?.(next, action);
    return;
  }
  const copy = quinceCopy(row);
  leafText(action, copy.text);
  if (action.className !== copy.className) action.className = copy.className;
  if (action.disabled !== copy.disabled) action.disabled = copy.disabled;
  if (action.dataset !== undefined) action.dataset.state = row.state;
}

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
  const layers = new Map<string, unknown>();
  let painted: GuavaStill[] = [];

  const ctx = canvas?.getContext?.('2d') ?? null;

  function show(stills: GuavaStill[]): void {
    painted = stills;
    if (ctx === null) return;
    ctx.clearRect(0, 0, canvas?.width ?? 1280, canvas?.height ?? 720);
    paintStack(ctx, stills, board.camera(), (src) => layers.get(src) ?? cache.get(src) ?? null);
    const screen = ctx as BlitCtx & ScreenCtx;
    if (typeof screen.fillRect === 'function' && typeof screen.fillText === 'function') {
      paintHealth(screen, board.health());
      paintHud(screen, board.hud());
      for (const control of board.controls()) {
        screen.fillStyle = control.id === 'bag' ? '#1c1814' : '#ffffff';
        screen.fillRect(control.x, control.y, control.width, control.height);
        screen.fillStyle = control.id === 'bag' ? '#ffffff' : '#1a140c';
        screen.font = control.font;
        if (control.id === 'bubble') {
          const pen = limePen(screen, control.text, control.x, control.width);
          screen.fillText(control.text, pen, control.y + 28);
        } else {
          screen.fillText(control.text, control.x + 12, control.y + 36);
        }
      }
      const now = Date.now();
      for (const num of board.damageNumbers(now)) {
        screen.fillStyle = num.color;
        screen.font = '800 44px Georgia, serif';
        screen.fillText(num.text, num.x, num.y);
      }
    }
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

  // Ground and overlays are plain pictures: no magenta peel, drawn at the map origin.
  const ImageCtor = root.Image;
  if (typeof ImageCtor === 'function') {
    for (const src of [GROUND_SRC, TOWN_BEHIND_SRC, TOWN_WALL_NEAR_SRC, CEMETERY_WALL_SRC]) {
      const layer = new ImageCtor();
      layer.onload = () => {
        layers.set(src, layer);
        show(painted);
      };
      layer.src = src;
    }
  }

  let oliveSig = '';

  function oliveText(id: string, text: string): void {
    const node = doc.getElementById(id);
    if (node !== null && node.textContent !== text) node.textContent = text;
  }

  function paintOlive(): void {
    if (!board.bagOpen) return;
    const sheet = board.inventory();
    if (sheet === null) return;
    oliveText('olive-coins', `Coins: ${sheet.coins}`);
    oliveText('olive-sword', sheet.sword);
    oliveText('olive-armor', sheet.armor);
    oliveText('olive-level', `Level ${sheet.level}`);
    oliveText('olive-health', sheet.health);
    oliveText('olive-strike', `Strike ${sheet.strike}`);
    oliveText('olive-xp', `Experience ${sheet.experience}`);
    paintOliveItems();
  }

  function paintOliveItems(): void {
    const host = doc.getElementById('olive-items');
    if (host === null || host === undefined) return;
    const gear = board.bagGear();
    const next = `${gear.items.join(',')}|${gear.sword ?? ''}|${gear.armor ?? ''}`;
    if (next === oliveSig) return;
    oliveSig = next;
    host.textContent = '';
    for (const itemId of gear.items) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.textContent = ownedItemLabel(itemId);
      const worn = itemId === gear.sword || itemId === gear.armor;
      if (!worn) {
        button.addEventListener?.('click', () => {
          board.equipOwned(itemId);
        });
      }
      host.appendChild?.(button);
    }
  }

  function paintQuince(): void {
    if (!board.smithOpen || smithList === null) return;
    const sheet = board.shop();
    const purse = doc.getElementById('quince-purse');
    const purseText = sheet === null ? '' : `Your coins: ${sheet.coins}`;
    if (purse !== null && purse.textContent !== purseText) purse.textContent = purseText;
    if (sheet === null) return;
    // Keep a fig row whose words did not change, so a click on it is not thrown away.
    if (!quinceRowsMatch(smithList, sheet.rows)) {
      plantQuinceRows(doc, smithList, sheet.rows, (itemId) => {
        const fresh = board.shop()?.rows.find((candidate) => candidate.id === itemId);
        if (fresh?.state !== 'buy') return;
        board.chooseQuince(itemId);
      });
      return;
    }
    const hosts = figChildren(smithList).filter((child) => child.dataset?.item !== undefined);
    sheet.rows.forEach((row, index) => {
      const host = hosts[index];
      if (host !== undefined) syncQuinceRow(doc, host, row, (itemId) => {
        const fresh = board.shop()?.rows.find((candidate) => candidate.id === itemId);
        if (fresh?.state !== 'buy') return;
        board.chooseQuince(itemId);
      });
    });
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
        if (open) paintQuince();
      },
      onBag(open) {
        const sheetEl = doc.getElementById('olive-sheet');
        if (sheetEl !== null) sheetEl.hidden = !open;
        if (open) paintOlive();
      },
      onOffer(offer) {
        if (plumDuel !== null) plumDuel.hidden = offer === null;
        if (plumOffer !== null) {
          plumOffer.textContent = offer === null ? '' : `${offer.fromName} asks for a duel.`;
        }
      },
      onSnapshot() {
        paintOlive();
        paintQuince();
        const stills = board.draw();
        for (const still of stills) loadSrc(still.src);
        show(stills);
      },
    },
  });

  plumAccept?.addEventListener?.('click', () => {
    board.accept();
  });
  plumDecline?.addEventListener?.('click', () => {
    board.decline();
  });
  doc.getElementById('quince-close')?.addEventListener?.('click', () => {
    board.closePanels();
  });
  doc.getElementById('olive-close')?.addEventListener?.('click', () => {
    board.closePanels();
  });
  doc.getElementById('olive-sword')?.addEventListener?.('click', () => {
    board.unequipWorn('sword');
  });
  doc.getElementById('olive-armor')?.addEventListener?.('click', () => {
    board.unequipWorn('armor');
  });
  const keyHost = doc as LooseDoc & {
    addEventListener?(type: string, listener: (event: LooseEvent) => void): void;
  };
  keyHost.addEventListener?.('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!board.smithOpen && !board.bagOpen) return;
    board.closePanels();
  });

  canvas?.addEventListener?.('mousedown', (event) => {
    if (event.button !== 0 && event.button !== 2) return;
    if (event.target !== undefined && event.target !== null && event.target !== canvas) return;
    event.preventDefault?.();
    const pixel = mapBerry(canvas, event);
    if (board.pressScreen(pixel.x, pixel.y)) return;
    const spot = canvasToMap(board.camera(), pixel.x, pixel.y);
    board.click({ x: spot.x, y: spot.y, button: event.button ?? 0 });
  });
  canvas?.addEventListener?.('contextmenu', (event) => {
    event.preventDefault?.();
  });

  // The kiwi rail is a real control over the picture. Presses on it must not become a walk or an attack.
  const kiwiZoom = doc.getElementById('kiwi-zoom');
  const guavaSlider = doc.getElementById('zoom-slider');
  if (guavaSlider !== null) {
    const applyGuava = () => {
      const raw = Number(guavaSlider.value);
      if (!Number.isFinite(raw)) return;
      board.setZoom(raw / 100);
      show(painted);
    };
    guavaSlider.value = String(Math.round(board.zoom() * 100));
    const swallow = (event: LooseEvent) => {
      event.stopPropagation?.();
    };
    for (const type of ['pointerdown', 'mousedown', 'click', 'touchstart']) {
      guavaSlider.addEventListener?.(type, swallow);
      kiwiZoom?.addEventListener?.(type, swallow);
    }
    guavaSlider.addEventListener?.('input', applyGuava);
    // The half-turn that puts 60 at the top also flips the arrow keys. Point them back at the picture.
    guavaSlider.addEventListener?.('keydown', (event) => {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      event.preventDefault?.();
      event.stopPropagation?.();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const current = Number(guavaSlider.value);
      const base = Number.isFinite(current) ? current : Math.round(ZOOM_CLOSE * 100);
      const next = Math.min(Math.round(ZOOM_FAR * 100), Math.max(Math.round(ZOOM_CLOSE * 100), base + step));
      guavaSlider.value = String(next);
      board.setZoom(next / 100);
      show(painted);
    });
  }
}
