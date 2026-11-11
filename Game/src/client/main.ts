// Lemon socket for the world. After a sign-in the page opens /ws.
// On close it sprouts another /ws with the same plum cookie. The cookie is HttpOnly,
// so each sprout is the same path and the browser repeats the cookie. No sleep between sprouts.

import type { Gender } from '../server/db';
import type { ClientMessage, HitMark } from '../protocol';
import { ZOOM_CLOSE, ZOOM_FAR, kaleConstants, type ZoneName } from '../rules/tables';
import { townSpawn } from '../rules/regions';
import { removeMagenta } from './sprites';
import { glideCitrus } from './smooth';
import { canvasToMap, mapToCanvas, viewBox, type PeachView } from './camera';
import { answerPlum, buyQuince, equipQuince, frontBeet, peelClick, unequipQuince, type ClickBerry } from './input';
import {
  CEMETERY_WALL_SRC,
  GROUND_SRC,
  TOWN_BEHIND_SRC,
  TOWN_WALL_NEAR_SRC,
  controlAt,
  createOliveReel,
  figStandSrc,
  inventorySheet,
  oliveCarryFromText,
  oliveCarryText,
  oliveDragFace,
  oliveDrop,
  paintOrchard,
  healthReadout,
  hudReadout,
  paintBeetRim,
  paintHealth,
  paintHud,
  paintStack,
  rememberGuavaPixels,
  shopSheet,
  townControls,
  type ShopRow,
  type OliveAction,
  type OliveCarry,
  type OliveTarget,
  type BlitCtx,
  type RimCtx,
  type ScreenCtx,
  type FigPaint,
  type GuavaStill,
  type HealthReadout,
  type HudReadout,
  type InventoryFacts,
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
  // Displayed feet chase the latest snapshot. dtSeconds is this frame. True when a foot moved.
  glideFeet(dtSeconds: number): boolean;
  // The picture at displayed feet. Does not advance the walk reel or the swing.
  pose(): GuavaStill[];
  // Stamp of the picture, including hit numbers and coin floats at nowMs.
  // The same stamp would paint the same canvas.
  citrusStamp(nowMs: number): string;
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
  equipOwned(itemId: string): void;
  unequipWorn(slot: 'sword' | 'armor'): void;
  bagGear(): { readonly items: readonly string[]; readonly sword: string | null; readonly armor: string | null };
  gearFacts(): InventoryFacts;
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
  let selfElsewhere: { itemId: string; by: string }[] = [];
  let selfCoinExpiry: { amount: number; atMs: number; lastAtMs?: number; groups?: { amount: number; atMs: number }[] } | null = null;
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
  // Displayed feet. The snapshot is the mango; these are the feet the canvas shows.
  const citrusShown = new Map<string, { x: number; y: number }>();
  // Last committed stills, in server space. The frame loop presents them at displayed feet.
  let mangoStills: GuavaStill[] | null = null;

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
    const expiry = fig.coinExpiry as { amount?: unknown; atMs?: unknown; lastAtMs?: unknown; groups?: unknown } | null | undefined;
    selfCoinExpiry =
      expiry !== null && expiry !== undefined && typeof expiry.amount === 'number' && typeof expiry.atMs === 'number'
        ? {
            amount: expiry.amount,
            atMs: expiry.atMs,
            lastAtMs: typeof expiry.lastAtMs === 'number' ? expiry.lastAtMs : expiry.atMs,
            groups: Array.isArray(expiry.groups)
              ? (expiry.groups as { amount?: unknown; atMs?: unknown }[])
                  .filter((g): g is { amount: number; atMs: number } => typeof g?.amount === 'number' && typeof g?.atMs === 'number')
                  .slice(0, 3)
              : [],
          }
        : null;
    selfElsewhere = Array.isArray(fig.elsewhere)
      ? (fig.elsewhere as { itemId?: unknown; by?: unknown }[]).filter(
          (row): row is { itemId: string; by: string } => typeof row?.itemId === 'string' && typeof row?.by === 'string',
        )
      : [];
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
      // New figs and far jumps land now, so the camera and the click see them before the next frame.
      glideFeet(0);
      hooks.onSnapshot?.();
      return;
    }
    if (row.type === 'duel_offer' && typeof row.fromId === 'string') {
      askerHeld = row.fromId;
      const fromName = typeof row.fromName === 'string' ? row.fromName : row.fromId;
      hooks.onOffer?.({ fromId: row.fromId, fromName });
    }
  }

  function citrusKey(role: 'player' | 'monster', id: string): string {
    return `${role}:${id}`;
  }

  function paintServer(): GuavaStill[] {
    const swinging = papayaSwings > 0;
    if (papayaSwings > 0) {
      papayaSwings -= 1;
    }
    const players: FigPaint[] = orchard.players.map((fig) => ({
      ...fig,
      gender: fig.gender ?? genderMap.get(fig.id) ?? (fig.id === selfId ? selfGender : 'woman'),
      attacking: fig.attacking === true || (swinging && fig.id === selfId),
    }));
    // Server spots drive facing, the walk bob, and the beet chase still. Displayed feet are applied after.
    return paintOrchard(reel, { ...orchard, players });
  }

  function presentCitrus(stills: readonly GuavaStill[]): GuavaStill[] {
    return stills.map((still) => {
      if (still.role === 'player' || still.role === 'monster') {
        const feet = citrusShown.get(citrusKey(still.role, still.id));
        if (feet === undefined || (feet.x === still.x && feet.y === still.y)) return still;
        return { ...still, x: feet.x, y: feet.y };
      }
      if (still.role === 'pet' && still.ownerId !== null) {
        const feet = citrusShown.get(citrusKey('player', still.ownerId));
        const server = orchard.players.find((fig) => fig.id === still.ownerId);
        if (feet === undefined || server === undefined) return still;
        const dx = feet.x - server.x;
        const dy = feet.y - server.y;
        if (dx === 0 && dy === 0) return still;
        return { ...still, x: still.x + dx, y: still.y + dy };
      }
      return still;
    });
  }

  function draw(): GuavaStill[] {
    mangoStills = paintServer();
    return presentCitrus(mangoStills);
  }

  function pose(): GuavaStill[] {
    if (mangoStills !== null) return presentCitrus(mangoStills);
    const savedWalk = reel.papayaWalk;
    const savedAttack = reel.papayaAttack;
    const savedSpots = reel.beetSpots;
    const savedSwings = papayaSwings;
    reel.papayaWalk = new Map(savedWalk);
    reel.papayaAttack = new Map(savedAttack);
    reel.beetSpots = new Map(savedSpots);
    try {
      return presentCitrus(paintServer());
    } finally {
      reel.papayaWalk = savedWalk;
      reel.papayaAttack = savedAttack;
      reel.beetSpots = savedSpots;
      papayaSwings = savedSwings;
    }
  }

  function glideFeet(dtSeconds: number): boolean {
    let moved = false;
    const keep = new Set<string>();
    const step = (role: 'player' | 'monster', id: string, x: number, y: number, pace: number) => {
      const key = citrusKey(role, id);
      keep.add(key);
      const prior = citrusShown.get(key) ?? null;
      const next = glideCitrus(prior, { x, y }, dtSeconds, pace);
      if (prior === null || prior.x !== next.x || prior.y !== next.y) moved = true;
      citrusShown.set(key, next);
    };
    for (const fig of orchard.players) {
      step('player', fig.id, fig.x, fig.y, kaleConstants.walkSpeedPxPerSec);
    }
    for (const beet of orchard.monsters) {
      step('monster', beet.id, beet.x, beet.y, kaleConstants.monsterChaseSpeedPxPerSec);
    }
    for (const key of citrusShown.keys()) {
      if (!keep.has(key)) {
        citrusShown.delete(key);
        moved = true;
      }
    }
    return moved;
  }

  function citrusStamp(nowMs: number): string {
    const stills = pose();
    const cam = camera();
    const life = health();
    const line = hud();
    const nums = damageNumbers(nowMs);
    const buttons = controls();
    const bits: string[] = [
      String(cam.x),
      String(cam.y),
      String(cam.width),
      String(cam.height),
      String(cam.scale),
      life.text,
      String(life.fillWidth),
      line.lines.join('\n'),
    ];
    for (const still of stills) {
      bits.push(
        still.role,
        still.id,
        still.still,
        still.src,
        still.facing,
        String(still.x),
        String(still.y),
        still.headGlow ? '1' : '0',
        still.redGlow ? '1' : '0',
      );
    }
    for (const num of nums) {
      bits.push(num.id, num.text, num.color, String(num.x), String(num.y));
    }
    for (const button of buttons) {
      bits.push(button.id, button.text, String(button.x), String(button.y));
    }
    return bits.join('|');
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
      items: selfItems,
      elsewhere: selfElsewhere,
      coinExpiry: selfCoinExpiry,
      gender: genderMap.get(selfId) ?? selfGender,
    };
  }

  function controls(): ScreenControl[] {
    // The blacksmith's bubble belongs to the town. The Bag button stays everywhere.
    return townControls(camera()).filter((row) => row.id !== 'bubble' || selfPlace === 'town');
  }

  function shop(): ShopSheet | null {
    if (!quinceOpen) return null;
    return shopSheet(selfCoins, [...selfItems, ...selfElsewhere.map((row) => row.itemId)]);
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
    const feet = self === undefined ? undefined : citrusShown.get(citrusKey('player', self.id));
    const spawn = townSpawn;
    return viewBox(selfPlace, feet?.x ?? self?.x ?? spawn[0], feet?.y ?? self?.y ?? spawn[1], guavaZoom);
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
    const stills = pose();
    const peeled = peelClick(berry, {
      selfId,
      selfPlace,
      players: stills
        .filter((still) => still.role === 'player')
        .map((still) => ({ id: still.id, x: still.x, y: still.y })),
      monsters: stills
        .filter((still) => still.role === 'monster')
        .map((still) => ({ id: still.id, kind: still.kind, x: still.x, y: still.y, src: still.src })),
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
    gearFacts: sheetFacts,
    ingest,
    draw,
    glideFeet,
    pose,
    citrusStamp,
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

interface LooseTransfer {
  effectAllowed?: string;
  dropEffect?: string;
  setData?(type: string, value: string): void;
  getData?(type: string): string;
  setDragImage?(image: unknown, x: number, y: number): void;
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
  draggable?: boolean;
  className?: string;
  tagName?: string;
  dataset?: Record<string, string>;
  children?: ArrayLike<LooseEl>;
  onload?: (() => void) | null;
  naturalWidth?: number;
  naturalHeight?: number;
  style?: { cursor?: string };
  appendChild?(child: LooseEl): void;
  replaceChild?(next: LooseEl, prev: LooseEl): void;
  removeChild?(child: LooseEl): void;
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
  dataTransfer?: LooseTransfer;
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

export interface CitrusHost {
  requestAnimationFrame(callback: (timeMs: number) => void): number;
  cancelAnimationFrame(handle: number): void;
  screenVisible(): boolean;
  paint(stills: readonly GuavaStill[], nowMs: number): void;
}

export interface CitrusLoop {
  start(): void;
  stop(): void;
}

// One papaya frame at a time. Hidden screens stop the loop. A repeated picture is not painted.
export function attachCitrusLoop(board: FigBoard, host: CitrusHost): CitrusLoop {
  let running = false;
  let handle = 0;
  let haveStamp = false;
  let lastStamp = 0;
  let lastKey = '';

  function stop(): void {
    running = false;
    haveStamp = false;
    lastKey = '';
    if (handle !== 0) {
      const pending = handle;
      handle = 0;
      host.cancelAnimationFrame(pending);
    }
  }

  function frame(stamp: number): void {
    handle = 0;
    if (!running) return;
    if (!host.screenVisible()) {
      stop();
      return;
    }
    const dt = haveStamp && Number.isFinite(stamp) ? Math.max(0, (stamp - lastStamp) / 1000) : 0;
    haveStamp = true;
    if (Number.isFinite(stamp)) lastStamp = stamp;
    board.glideFeet(dt);
    const nowMs = Date.now();
    const key = board.citrusStamp(nowMs);
    if (key !== lastKey) {
      lastKey = key;
      host.paint(board.pose(), nowMs);
    }
    if (!running || !host.screenVisible()) {
      stop();
      return;
    }
    handle = host.requestAnimationFrame(frame);
    if (handle === 0) running = false;
  }

  function start(): void {
    if (running) return;
    if (!host.screenVisible()) return;
    running = true;
    haveStamp = false;
    handle = host.requestAnimationFrame(frame);
    if (handle === 0) running = false;
  }

  return { start, stop };
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
  // Set only while the pointer sits on a beet. A still screen must not keep the rim.
  let melonHoverId: string | null = null;
  let melonPointer: { x: number; y: number } | null = null;

  const ctx = canvas?.getContext?.('2d') ?? null;

  function setPapayaCursor(cursor: string): void {
    if (canvas == null) return;
    if (canvas.style == null) canvas.style = {};
    canvas.style.cursor = cursor;
  }

  function beetAt(stills: readonly GuavaStill[], mapX: number, mapY: number): string | null {
    const rows = stills
      .filter((still) => still.role === 'monster')
      .map((still) => ({ id: still.id, kind: still.kind, x: still.x, y: still.y, src: still.src }));
    return frontBeet(mapX, mapY, rows)?.id ?? null;
  }

  function show(stills: GuavaStill[], nowMs = Date.now()): void {
    painted = stills;
    if (melonPointer !== null) {
      const next = beetAt(stills, melonPointer.x, melonPointer.y);
      if (next !== melonHoverId) {
        melonHoverId = next;
        setPapayaCursor(next === null ? '' : 'pointer');
      }
    }
    if (ctx === null) return;
    const view = board.camera();
    ctx.clearRect(0, 0, canvas?.width ?? 1280, canvas?.height ?? 720);
    paintStack(ctx, stills, view, (src) => layers.get(src) ?? cache.get(src) ?? null);
    const rim = ctx as LooseCtx & RimCtx;
    if (
      melonHoverId !== null &&
      typeof rim.save === 'function' &&
      typeof rim.stroke === 'function' &&
      typeof rim.beginPath === 'function'
    ) {
      const beet = stills.find((still) => still.role === 'monster' && still.id === melonHoverId);
      if (beet !== undefined) paintBeetRim(rim, beet.x, beet.y, beet.kind, beet.src, view);
    }
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
      for (const num of board.damageNumbers(nowMs)) {
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
      const width = img.naturalWidth ?? 0;
      const height = img.naturalHeight ?? 0;
      if (width > 0 && height > 0) rememberGuavaPixels(src, width, height);
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
  let oliveCarryStash: OliveCarry | null = null;
  // True only between dragstart and dragend. A late drop still reads the stash.
  let oliveDragLive = false;
  // A drag's click must not also equip or unequip. The next pointer down clears it.
  let oliveDragMoved = false;

  function oliveText(id: string, text: string): void {
    const node = doc.getElementById(id);
    if (node !== null && node.textContent !== text) node.textContent = text;
  }

  function findField(root: LooseEl, field: string): LooseEl | null {
    const kids = figChildren(root);
    for (const child of kids) {
      if (child.dataset?.field === field) return child;
      const nested = findField(child, field);
      if (nested !== null) return nested;
    }
    return null;
  }

  function ensureSlot(slot: LooseEl, kindLabel: string): void {
    if (findField(slot, 'name') !== null) return;
    slot.textContent = '';
    const copy = doc.createElement('div');
    const kind = doc.createElement('div');
    kind.className = 'kind';
    kind.textContent = kindLabel;
    const name = doc.createElement('div');
    name.className = 'what';
    if (name.dataset !== undefined) name.dataset.field = 'name';
    copy.appendChild?.(kind);
    copy.appendChild?.(name);
    const drop = doc.createElement('div');
    drop.className = 'dropword';
    drop.hidden = true;
    drop.textContent = 'Drop to equip';
    if (drop.dataset !== undefined) drop.dataset.field = 'drop';
    const bonus = doc.createElement('b');
    if (bonus.dataset !== undefined) bonus.dataset.field = 'bonus';
    slot.appendChild?.(copy);
    slot.appendChild?.(drop);
    slot.appendChild?.(bonus);
  }

  function keepClass(node: LooseEl, rest: string): void {
    const name = node.className ?? '';
    if (name.includes('lime') || name.includes('peach')) return;
    if (name !== rest) node.className = rest;
  }

  function readCarry(event: LooseEvent): OliveCarry | null {
    const raw = event.dataTransfer?.getData?.('text/plain') ?? '';
    if (raw.length > 0) {
      const parsed = oliveCarryFromText(raw);
      if (parsed !== null) return parsed;
    }
    return oliveCarryStash;
  }

  function wornNow(): { sword: string | null; armor: string | null } {
    const gear = board.bagGear();
    return { sword: gear.sword, armor: gear.armor };
  }

  function applyOlive(action: OliveAction): void {
    if (action.type === 'equip') board.equipOwned(action.itemId);
    else board.unequipWorn(action.slot);
  }

  function showDragFace(carry: OliveCarry | null): void {
    const sword = doc.getElementById('olive-sword');
    const armor = doc.getElementById('olive-armor');
    const row = doc.getElementById('olive-items');
    const hint = doc.getElementById('olive-hint');
    const face = carry === null ? null : oliveDragFace(board.gearFacts(), carry);
    const moodOf = (slot: 'sword' | 'armor'): 'lime' | 'peach' | 'rest' => {
      if (face === null) return 'rest';
      return slot === 'sword' ? face.sword : face.armor;
    };
    for (const pair of [
      [sword, 'sword'],
      [armor, 'armor'],
    ] as const) {
      const node = pair[0];
      if (node === null) continue;
      const mood = moodOf(pair[1]);
      const next = mood === 'rest' ? 'slot' : `slot ${mood}`;
      if (node.className !== next) node.className = next;
      const drop = findField(node, 'drop');
      if (drop !== null) drop.hidden = mood !== 'lime';
    }
    if (row !== null) {
      const next = face?.row === 'lime' ? 'plum-row lime' : 'plum-row';
      if (row.className !== next) row.className = next;
    }
    if (hint !== null) {
      const text = face?.hint ?? '';
      if (hint.textContent !== text) hint.textContent = text;
      hint.hidden = text.length === 0;
    }
  }

  function beginCarry(event: LooseEvent, carry: OliveCarry): void {
    oliveDragMoved = true;
    oliveDragLive = true;
    oliveCarryStash = carry;
    if (event.dataTransfer !== undefined) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData?.('text/plain', oliveCarryText(carry));
    }
    showDragFace(carry);
  }

  function forgetCarry(): void {
    oliveDragLive = false;
    oliveCarryStash = null;
    showDragFace(null);
  }

  function endCarry(): void {
    // A pointer drag can end before the drop lands. Keep the stash for that drop.
    oliveDragLive = false;
    showDragFace(null);
  }

  // A dragover after that early end paints the lime slot again.
  function acceptCarry(event: LooseEvent, target: OliveTarget): OliveAction | null {
    const carry = readCarry(event);
    if (carry === null) return null;
    showDragFace(carry);
    const action = oliveDrop(carry, target, wornNow());
    allowDrop(event, action);
    return action;
  }

  function allowDrop(event: LooseEvent, action: OliveAction | null): boolean {
    if (action === null) return false;
    event.preventDefault?.();
    if (event.dataTransfer !== undefined) event.dataTransfer.dropEffect = 'move';
    return true;
  }

  function paintOliveFig(src: string): void {
    const lime = doc.getElementById('olive-fig');
    if (lime === null || lime === undefined) return;
    if (lime.dataset === undefined) lime.dataset = {};
    if (lime.dataset.stand === src) return;
    lime.dataset.stand = src;
    lime.draggable = false;
    lime.src = src;
    const Picture = root.Image;
    if (typeof Picture !== 'function') return;
    const picture = new Picture();
    picture.onload = () => {
      if (lime.dataset?.stand !== src) return;
      const peeled = peelImage(picture);
      const canvas = peeled as LooseEl & { toDataURL?(kind: string): string };
      if (peeled !== picture && typeof canvas.toDataURL === 'function' && lime.dataset?.stand === src) {
        lime.src = canvas.toDataURL('image/png');
      }
    };
    picture.src = src;
  }

  function syncGrape(node: LooseEl, tile: { id: string; name: string; bonus: string; worn: boolean; slot: 'sword' | 'armor'; by?: string }): void {
    const other = tile.by !== undefined;
    const nextClass = other ? 'grape worn other' : tile.worn ? 'grape worn' : 'grape';
    if (node.className !== nextClass) node.className = nextClass;
    if (node.draggable !== !other) node.draggable = !other;
    if (node.dataset !== undefined) {
      node.dataset.item = tile.id;
      node.dataset.slot = tile.slot;
    }
    const name = figChildren(node).find((child) => child.className === 'nm') ?? null;
    const bonus = figChildren(node).find((child) => child.className === 'bn') ?? null;
    leafText(name, tile.name);
    leafText(bonus, tile.bonus);
    const seal = figChildren(node).find((child) => child.className === 'seal') ?? null;
    const sealText = other ? `Worn by ${tile.by}` : 'Equipped';
    if ((tile.worn || other) && seal === null) {
      const mark = doc.createElement('span');
      mark.className = 'seal';
      mark.textContent = sealText;
      node.appendChild?.(mark);
    } else if (!(tile.worn || other) && seal !== null) {
      node.removeChild?.(seal);
    } else if (seal !== null) {
      leafText(seal, sealText);
    }
  }

  function makeGrape(tile: { id: string; name: string; bonus: string; worn: boolean; slot: 'sword' | 'armor'; by?: string }): LooseEl {
    const node = doc.createElement('div');
    const other = tile.by !== undefined;
    node.className = other ? 'grape worn other' : tile.worn ? 'grape worn' : 'grape';
    node.draggable = !other;
    if (node.dataset !== undefined) {
      node.dataset.item = tile.id;
      node.dataset.slot = tile.slot;
    }
    const name = doc.createElement('span');
    name.className = 'nm';
    name.textContent = tile.name;
    const bonus = doc.createElement('span');
    bonus.className = 'bn';
    bonus.textContent = tile.bonus;
    node.appendChild?.(name);
    node.appendChild?.(bonus);
    if (tile.worn || other) {
      const mark = doc.createElement('span');
      mark.className = 'seal';
      mark.textContent = other ? `Worn by ${tile.by}` : 'Equipped';
      node.appendChild?.(mark);
    }
    // A copy another avatar wears can be seen but not used: no drag, no click.
    if (other) return node;
    const arm = () => {
      oliveDragMoved = false;
      if (!oliveDragLive) oliveCarryStash = null;
    };
    node.addEventListener?.('pointerdown', arm);
    node.addEventListener?.('mousedown', arm);
    node.addEventListener?.('click', () => {
      if (oliveDragMoved) {
        oliveDragMoved = false;
        return;
      }
      const itemId = node.dataset?.item ?? '';
      if (itemId.length > 0) board.equipOwned(itemId);
    });
    node.addEventListener?.('dragstart', (event) => {
      const itemId = node.dataset?.item ?? '';
      const slot = node.dataset?.slot;
      if (itemId.length === 0 || (slot !== 'sword' && slot !== 'armor')) return;
      beginCarry(event, { from: 'tile', itemId, slot });
    });
    node.addEventListener?.('dragend', () => {
      endCarry();
    });
    return node;
  }

  function paintOlive(): void {
    if (!board.bagOpen) return;
    const sheet = board.inventory();
    if (sheet === null) return;
    oliveText('olive-coins', `Coins: ${sheet.coins}`);
    oliveText('olive-expiry', sheet.expiry);
    {
      const tip = document.getElementById('olive-expiry');
      if (tip !== null) tip.title = sheet.expiryTip;
    }
    oliveText('olive-level', String(sheet.level));
    oliveText('olive-health', sheet.health);
    oliveText('olive-strike', String(sheet.strike));
    oliveText('olive-xp', sheet.experience);
    const sword = doc.getElementById('olive-sword');
    const armor = doc.getElementById('olive-armor');
    if (sword !== null) {
      ensureSlot(sword, 'Sword');
      keepClass(sword, 'slot');
      leafText(findField(sword, 'name'), sheet.sword);
      leafText(findField(sword, 'bonus'), sheet.swordBonus);
      sword.draggable = sheet.swordBonus.length > 0;
    }
    if (armor !== null) {
      ensureSlot(armor, 'Armor');
      keepClass(armor, 'slot');
      leafText(findField(armor, 'name'), sheet.armor);
      leafText(findField(armor, 'bonus'), sheet.armorBonus);
      armor.draggable = sheet.armorBonus.length > 0;
    }
    paintOliveItems(sheet.tiles);
    paintOliveFig(sheet.portrait);
    if (oliveDragLive && oliveCarryStash !== null) showDragFace(oliveCarryStash);
  }

  function paintOliveItems(tiles: readonly { id: string; name: string; bonus: string; worn: boolean; slot: 'sword' | 'armor'; by?: string }[]): void {
    const host = doc.getElementById('olive-items');
    if (host === null || host === undefined) return;
    keepClass(host, 'plum-row');
    const next = tiles.map((tile) => `${tile.id}${tile.by === undefined ? '' : ':' + tile.by}`).join(',');
    if (next !== oliveSig) {
      oliveSig = next;
      host.textContent = '';
      for (const tile of tiles) host.appendChild?.(makeGrape(tile));
      return;
    }
    const kids = figChildren(host);
    tiles.forEach((tile, index) => {
      const node = kids[index];
      if (node !== undefined) syncGrape(node, tile);
    });
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
        if (!open) forgetCarry();
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
  function carryFromSlot(slot: 'sword' | 'armor'): OliveCarry | null {
    const gear = board.bagGear();
    const itemId = slot === 'sword' ? gear.sword : gear.armor;
    if (itemId === null || itemId.length === 0) return null;
    return { from: 'slot', itemId, slot };
  }

  function wireSlot(id: string, slot: 'sword' | 'armor'): void {
    const node = doc.getElementById(id);
    if (node === null) return;
    const arm = () => {
      oliveDragMoved = false;
      if (!oliveDragLive) oliveCarryStash = null;
    };
    node.addEventListener?.('pointerdown', arm);
    node.addEventListener?.('mousedown', arm);
    node.addEventListener?.('click', () => {
      if (oliveDragMoved) {
        oliveDragMoved = false;
        return;
      }
      board.unequipWorn(slot);
    });
    node.addEventListener?.('dragstart', (event) => {
      const carry = carryFromSlot(slot);
      if (carry === null) return;
      beginCarry(event, carry);
    });
    node.addEventListener?.('dragend', () => {
      endCarry();
    });
    const accept = (event: LooseEvent) => {
      acceptCarry(event, { kind: 'slot', slot });
    };
    node.addEventListener?.('dragenter', accept);
    node.addEventListener?.('dragover', accept);
    node.addEventListener?.('drop', (event) => {
      const action = acceptCarry(event, { kind: 'slot', slot });
      if (action === null) return;
      applyOlive(action);
      forgetCarry();
    });
  }

  function wireRow(): void {
    const node = doc.getElementById('olive-items');
    if (node === null) return;
    const accept = (event: LooseEvent) => {
      acceptCarry(event, { kind: 'row' });
    };
    node.addEventListener?.('dragenter', accept);
    node.addEventListener?.('dragover', accept);
    node.addEventListener?.('drop', (event) => {
      const action = acceptCarry(event, { kind: 'row' });
      if (action === null) return;
      applyOlive(action);
      forgetCarry();
    });
  }

  function shutPanels(): void {
    forgetCarry();
    board.closePanels();
  }

  doc.getElementById('quince-close')?.addEventListener?.('click', () => {
    shutPanels();
  });
  doc.getElementById('olive-close')?.addEventListener?.('click', () => {
    shutPanels();
  });
  wireSlot('olive-sword', 'sword');
  wireSlot('olive-armor', 'armor');
  wireRow();
  const keyHost = doc as LooseDoc & {
    addEventListener?(type: string, listener: (event: LooseEvent) => void): void;
  };
  keyHost.addEventListener?.('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!board.smithOpen && !board.bagOpen) return;
    shutPanels();
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
  const aimBeet = (event: LooseEvent) => {
    if (canvas == null) return;
    const pixel = mapBerry(canvas, event);
    const spot = canvasToMap(board.camera(), pixel.x, pixel.y);
    melonPointer = spot;
    const stills = board.pose();
    const next = beetAt(stills, spot.x, spot.y);
    if (next === melonHoverId) return;
    melonHoverId = next;
    setPapayaCursor(next === null ? '' : 'pointer');
    show(stills);
  };
  canvas?.addEventListener?.('pointermove', aimBeet);
  canvas?.addEventListener?.('pointerleave', () => {
    melonPointer = null;
    setPapayaCursor('');
    if (melonHoverId === null) return;
    melonHoverId = null;
    show(board.pose());
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

  // Snapshots update the mango. This loop glides the displayed feet and repaints between them.
  const screenOpen = (): boolean => {
    const page = root.document as { hidden?: boolean } | undefined;
    if (page?.hidden === true) return false;
    const canvasEl = doc.getElementById('papaya-canvas');
    if (canvasEl == null || canvasEl.hidden === true) return false;
    return true;
  };
  const citrus = attachCitrusLoop(board, {
    requestAnimationFrame(callback) {
      const raf = (root as { requestAnimationFrame?: (cb: (timeMs: number) => void) => number }).requestAnimationFrame;
      if (typeof raf !== 'function') return 0;
      return raf.call(root, callback);
    },
    cancelAnimationFrame(id) {
      const cancel = (root as { cancelAnimationFrame?: (id: number) => void }).cancelAnimationFrame;
      if (typeof cancel === 'function') cancel.call(root, id);
    },
    screenVisible: screenOpen,
    paint(stills, nowMs) {
      for (const still of stills) loadSrc(still.src);
      show(stills, nowMs);
    },
  });
  const page = root.document as LooseDoc & {
    addEventListener?(type: string, listener: () => void): void;
  };
  page?.addEventListener?.('visibilitychange', () => {
    if (screenOpen()) citrus.start();
    else citrus.stop();
  });
  const Observer = (root as { MutationObserver?: new (cb: () => void) => { observe(target: unknown, options: { attributes: boolean; attributeFilter: string[] }): void } }).MutationObserver;
  if (typeof Observer === 'function' && canvas != null) {
    try {
      const watch = new Observer(() => {
        if (screenOpen()) citrus.start();
        else citrus.stop();
      });
      watch.observe(canvas, { attributes: true, attributeFilter: ['hidden'] });
    } catch {
      // A test double is not a node. The next frame still stops when the canvas is hidden.
    }
  }
  citrus.start();
}
