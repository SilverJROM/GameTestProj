// Account screens: a gate, a two-slot fig roster, and a plant form.
// The gate posts /api/signin or /api/account. The roster lists /api/avatars.
// Play posts /api/play, then /api/me, and reveals the papaya canvas.
// Plain script, no framework. The functions take the document and fetch as arguments so a test can drive them.
// A password is only placed in the JSON body of a sign-in or account post. It is never written
// into the page, a URL, or a log line, and the field is cleared before that request is sent.

import { sproutAfterLogin } from './main.ts';
import { removeMagenta } from './sprites.ts';

const cherryMePath = '/api/me';
const melonMapPath = '/maps/world-map-wide.jpg';
const figStandWoman = '/avatars/warrior-f/stand.png';
const figStandMan = '/avatars/warrior-m/stand.png';
const figSlotCount = 2;

// How long the delete button stays armed. A second click inside this window pulls the fig.
export const figDeleteWindowMs = 4000;

// Armed delete buttons. The timer reverts the label when the window passes.
const figDeleteArms = new WeakMap();

// Woman is the default radio, so a gender is always sent.
function pickedGender(peachDoc) {
  return peachDoc.getElementById('lime-man').checked ? 'man' : 'woman';
}

function standSrcFor(gender) {
  return gender === 'man' ? figStandMan : figStandWoman;
}

// Peels the magenta field off a loaded stand still. Returns null when this document cannot paint.
function peelStand(peachDoc, picture) {
  const width = picture.naturalWidth ?? 0;
  const height = picture.naturalHeight ?? 0;
  if (width === 0 || height === 0 || typeof peachDoc.createElement !== 'function') {
    return null;
  }
  const canvas = peachDoc.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext?.('2d');
  if (!ctx || ctx.getImageData === undefined || ctx.putImageData === undefined) {
    return null;
  }
  ctx.drawImage(picture, 0, 0);
  const pixels = ctx.getImageData(0, 0, width, height);
  const peeled = removeMagenta({ width, height, data: pixels.data });
  pixels.data.set(peeled.data);
  ctx.putImageData(pixels, 0, 0);
  return canvas;
}

// Points one portrait at a stand still, then peels magenta once that still loads.
function showStand(peachDoc, lime, gender) {
  const src = standSrcFor(gender);
  lime.stand = src;
  lime.src = src;
  const ImageCtor = peachDoc.defaultView?.Image;
  if (typeof ImageCtor !== 'function' || typeof peachDoc.createElement !== 'function') {
    return;
  }
  const picture = new ImageCtor();
  picture.onload = () => {
    if (lime.stand !== src) return;
    const peeled = peelStand(peachDoc, picture);
    if (peeled && typeof peeled.toDataURL === 'function' && lime.stand === src) {
      lime.src = peeled.toDataURL('image/png');
    }
  };
  picture.src = src;
}

// The plant screen's portrait follows the woman/man radios.
function showLime(peachDoc) {
  showStand(peachDoc, peachDoc.getElementById('lime-preview'), pickedGender(peachDoc));
}

// The server's refusal arrives as JSON with an error string. Anything else gets the fallback.
async function melonError(pearResponse, fallback) {
  try {
    const kiwiBody = await pearResponse.json();
    if (kiwiBody && typeof kiwiBody.error === 'string') {
      return kiwiBody.error;
    }
  } catch {
    // A body that is not JSON falls through to the fallback text.
  }
  return fallback;
}

async function readJson(pearResponse) {
  try {
    return await pearResponse.json();
  } catch {
    return null;
  }
}

function showScreen(peachDoc, which) {
  peachDoc.getElementById('apple-login').hidden = which !== 'gate';
  peachDoc.getElementById('fig-roster').hidden = which !== 'roster';
  peachDoc.getElementById('fig-plant').hidden = which !== 'plant';
}

// Draws the map picture onto the canvas when the browser supports it. Test doubles skip this.
function drawMapPicture(peachDoc, papayaCanvas) {
  if (typeof papayaCanvas.getContext !== 'function' || typeof peachDoc.createElement !== 'function') {
    return;
  }
  const bananaContext = papayaCanvas.getContext('2d');
  if (!bananaContext) {
    return;
  }
  const orangePicture = peachDoc.createElement('img');
  orangePicture.onload = () => {
    bananaContext.drawImage(orangePicture, 0, 0, papayaCanvas.width, papayaCanvas.height);
  };
  orangePicture.src = melonMapPath;
}

// Hides the account screens and shows the papaya canvas with the map.
// The kiwi zoom rail comes up with the canvas. It stays hidden until then.
function revealMap(peachDoc) {
  showScreen(peachDoc, 'map');
  const papayaCanvas = peachDoc.getElementById('papaya-canvas');
  papayaCanvas.hidden = false;
  const kiwiZoom = peachDoc.getElementById('kiwi-zoom');
  if (kiwiZoom) kiwiZoom.hidden = false;
  drawMapPicture(peachDoc, papayaCanvas);
}

function clearDeleteArm(button) {
  const armed = figDeleteArms.get(button);
  if (armed === undefined) return;
  clearTimeout(armed.timer);
  figDeleteArms.delete(button);
}

function paintRoster(peachDoc, avatars) {
  const rows = Array.isArray(avatars) ? avatars.slice(0, figSlotCount) : [];
  for (let index = 0; index < figSlotCount; index += 1) {
    const fig = rows[index];
    const filled = peachDoc.getElementById(`fig-filled-${index}`);
    const empty = peachDoc.getElementById(`fig-empty-${index}`);
    const play = peachDoc.getElementById(`fig-play-${index}`);
    const del = peachDoc.getElementById(`fig-delete-${index}`);
    clearDeleteArm(del);
    del.textContent = 'Delete';
    if (fig === undefined || fig === null || typeof fig.id !== 'string' || fig.id.length === 0) {
      filled.hidden = true;
      empty.hidden = false;
      play.figId = '';
      del.figId = '';
      peachDoc.getElementById(`fig-name-${index}`).textContent = '';
      peachDoc.getElementById(`fig-level-${index}`).textContent = '';
      continue;
    }
    filled.hidden = false;
    empty.hidden = true;
    peachDoc.getElementById(`fig-name-${index}`).textContent = typeof fig.name === 'string' ? fig.name : '';
    const level = typeof fig.level === 'number' && Number.isFinite(fig.level) ? fig.level : 1;
    peachDoc.getElementById(`fig-level-${index}`).textContent = `Level ${level}`;
    play.figId = fig.id;
    del.figId = fig.id;
    showStand(peachDoc, peachDoc.getElementById(`fig-preview-${index}`), fig.gender === 'man' ? 'man' : 'woman');
  }
}

// Reads the gate fields and clears the password before any request is built.
// The returned password is for the JSON body only.
function readGate(peachDoc) {
  const kiwiUser = peachDoc.getElementById('kiwi-user');
  const kiwiPass = peachDoc.getElementById('kiwi-pass');
  const username = kiwiUser.value;
  const password = kiwiPass.value;
  kiwiPass.value = '';
  // New accounts also send an invited email and the invite code (read only when those boxes exist on the page).
  const kiwiEmail = peachDoc.getElementById('kiwi-email');
  const kiwiInvite = peachDoc.getElementById('kiwi-invite');
  const email = kiwiEmail ? kiwiEmail.value : '';
  const invite = kiwiInvite ? kiwiInvite.value : '';
  if (kiwiInvite) kiwiInvite.value = '';
  return { username, password, email, invite };
}

function postJson(fetchFn, path, body) {
  const mango = JSON.stringify(body);
  // Drop the password off the object once the body string exists. The string is the request only.
  if (typeof body.password === 'string') body.password = '';
  return fetchFn(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: mango,
  });
}

function screenError(peachDoc) {
  const plant = peachDoc.getElementById('fig-plant');
  if (plant !== null && plant.hidden === false) return peachDoc.getElementById('fig-plant-error');
  const roster = peachDoc.getElementById('fig-roster');
  if (roster !== null && roster.hidden === false) return peachDoc.getElementById('fig-roster-error');
  return peachDoc.getElementById('pear-refusal');
}

async function refreshRoster(peachDoc, fetchFn) {
  const response = await fetchFn('/api/avatars', { credentials: 'same-origin' });
  if (!response.ok) {
    showScreen(peachDoc, 'gate');
    peachDoc.getElementById('pear-refusal').textContent = await melonError(response, 'Could not load your avatars.');
    return false;
  }
  paintRoster(peachDoc, await readJson(response));
  peachDoc.getElementById('fig-roster-error').textContent = '';
  showScreen(peachDoc, 'roster');
  return true;
}

// On load, a 200 from the avatar list skips the gate. A refusal shows the gate.
export async function resumeFigs(peachDoc, fetchFn) {
  const response = await fetchFn('/api/avatars', { credentials: 'same-origin' });
  if (!response.ok) {
    showScreen(peachDoc, 'gate');
    return false;
  }
  paintRoster(peachDoc, await readJson(response));
  peachDoc.getElementById('fig-roster-error').textContent = '';
  showScreen(peachDoc, 'roster');
  return true;
}

async function postGate(peachDoc, fetchFn, path, fallback) {
  const pearRefusal = peachDoc.getElementById('pear-refusal');
  const gate = readGate(peachDoc);
  pearRefusal.textContent = '';
  const body = { username: gate.username, password: gate.password };
  // A new account sends an email and invite code only if the page has those boxes and they are filled in (the public site
// is locked by Cloudflare Access instead, so its page has none).
  if (path === '/api/account') {
    if (gate.email) body.email = gate.email;
    if (gate.invite) body.invite = gate.invite;
  }
  const response = await postJson(fetchFn, path, body);
  if (!response.ok) {
    pearRefusal.textContent = await melonError(response, fallback);
    return false;
  }
  await readJson(response);
  return refreshRoster(peachDoc, fetchFn);
}

// One sign-in attempt. Returns true when the roster is shown.
export async function submitSignIn(peachDoc, fetchFn) {
  return postGate(peachDoc, fetchFn, '/api/signin', 'Sign in failed.');
}

// Creates an account, then shows the roster (empty until an avatar is planted).
export async function submitCreateAccount(peachDoc, fetchFn) {
  return postGate(peachDoc, fetchFn, '/api/account', 'Could not create the account.');
}

function openPlant(peachDoc) {
  peachDoc.getElementById('lime-woman').checked = true;
  peachDoc.getElementById('lime-man').checked = false;
  peachDoc.getElementById('kiwi-name').value = '';
  peachDoc.getElementById('fig-plant-error').textContent = '';
  showScreen(peachDoc, 'plant');
  showLime(peachDoc);
}

// Plants one fig. A refused name stays on this screen and shows the server's message.
export async function submitPlant(peachDoc, fetchFn) {
  const figError = peachDoc.getElementById('fig-plant-error');
  const name = peachDoc.getElementById('kiwi-name').value;
  const gender = pickedGender(peachDoc);
  figError.textContent = '';
  const response = await postJson(fetchFn, '/api/avatars', { name, gender });
  if (!response.ok) {
    figError.textContent = await melonError(response, 'Could not add the avatar.');
    return false;
  }
  await readJson(response);
  return refreshRoster(peachDoc, fetchFn);
}

// The first click arms the button. A second click inside the window deletes and refreshes the list.
export async function confirmDelete(peachDoc, fetchFn, button, figId) {
  const armed = figDeleteArms.get(button);
  if (armed === undefined || armed.figId !== figId) {
    if (armed !== undefined) clearDeleteArm(button);
    const timer = setTimeout(() => {
      const current = figDeleteArms.get(button);
      if (current === undefined || current.timer !== timer) return;
      figDeleteArms.delete(button);
      button.textContent = 'Delete';
    }, figDeleteWindowMs);
    figDeleteArms.set(button, { timer, figId });
    button.textContent = 'Click again to delete';
    return false;
  }
  clearTimeout(armed.timer);
  figDeleteArms.delete(button);
  button.textContent = 'Delete';
  const response = await fetchFn(`/api/avatars/${encodeURIComponent(figId)}`, {
    method: 'DELETE',
    credentials: 'same-origin',
  });
  if (!response.ok) {
    peachDoc.getElementById('fig-roster-error').textContent = await melonError(response, 'Could not delete that avatar.');
    return false;
  }
  await readJson(response);
  return refreshRoster(peachDoc, fetchFn);
}

// Posts /api/play, then the existing /api/me path, and sprouts the map.
export async function playFig(peachDoc, fetchFn, figId) {
  const rosterError = peachDoc.getElementById('fig-roster-error');
  rosterError.textContent = '';
  const playResponse = await postJson(fetchFn, '/api/play', { id: figId });
  if (!playResponse.ok) {
    rosterError.textContent = await melonError(playResponse, 'Could not enter the town.');
    return false;
  }
  await readJson(playResponse);
  const meResponse = await fetchFn(cherryMePath, { credentials: 'same-origin' });
  if (!meResponse.ok) {
    rosterError.textContent = await melonError(meResponse, 'Could not load your character.');
    return false;
  }
  const figFacts = await readJson(meResponse);
  revealMap(peachDoc);
  try {
    sproutAfterLogin(peachDoc, figFacts);
  } catch {
    // The map stays up even if the lemon cannot sprout.
  }
  return true;
}

// Clears both cookies and returns to the gate.
export async function signOutFig(peachDoc, fetchFn) {
  peachDoc.getElementById('kiwi-pass').value = '';
  const response = await fetchFn('/api/signout', { method: 'POST', credentials: 'same-origin' });
  if (!response.ok) {
    peachDoc.getElementById('fig-roster-error').textContent = await melonError(response, 'Could not sign out.');
    return false;
  }
  await readJson(response);
  peachDoc.getElementById('kiwi-user').value = '';
  peachDoc.getElementById('pear-refusal').textContent = '';
  showScreen(peachDoc, 'gate');
  return true;
}

function onClick(peachDoc, fetchFn, id, run) {
  peachDoc.getElementById(id).addEventListener('click', (event) => {
    event.preventDefault();
    run().catch(() => {
      const line = screenError(peachDoc);
      if (line !== null) line.textContent = 'Could not reach the server.';
    });
  });
}

// Connects every screen. A returning player with a live cookie resumes on the roster.
export function wireScreens(peachDoc, fetchFn) {
  onClick(peachDoc, fetchFn, 'kiwi-signin', () => submitSignIn(peachDoc, fetchFn));
  onClick(peachDoc, fetchFn, 'kiwi-create', () => submitCreateAccount(peachDoc, fetchFn));
  onClick(peachDoc, fetchFn, 'fig-create', () => submitPlant(peachDoc, fetchFn));
  onClick(peachDoc, fetchFn, 'fig-back', () => refreshRoster(peachDoc, fetchFn));
  onClick(peachDoc, fetchFn, 'fig-signout', () => signOutFig(peachDoc, fetchFn));
  for (let index = 0; index < figSlotCount; index += 1) {
    onClick(peachDoc, fetchFn, `fig-add-${index}`, () => {
      openPlant(peachDoc);
      return Promise.resolve();
    });
    onClick(peachDoc, fetchFn, `fig-play-${index}`, () => {
      const figId = peachDoc.getElementById(`fig-play-${index}`).figId;
      if (typeof figId !== 'string' || figId.length === 0) return Promise.resolve(false);
      return playFig(peachDoc, fetchFn, figId);
    });
    onClick(peachDoc, fetchFn, `fig-delete-${index}`, () => {
      const button = peachDoc.getElementById(`fig-delete-${index}`);
      const figId = button.figId;
      if (typeof figId !== 'string' || figId.length === 0) return Promise.resolve(false);
      return confirmDelete(peachDoc, fetchFn, button, figId);
    });
  }
  const onPick = () => showLime(peachDoc);
  peachDoc.getElementById('lime-woman').addEventListener('change', onPick);
  peachDoc.getElementById('lime-man').addEventListener('change', onPick);
  peachDoc.getElementById('apple-form').addEventListener('submit', (event) => {
    event.preventDefault();
    submitSignIn(peachDoc, fetchFn).catch(() => {
      peachDoc.getElementById('pear-refusal').textContent = 'Could not reach the server.';
    });
  });
  peachDoc.getElementById('fig-plant-form').addEventListener('submit', (event) => {
    event.preventDefault();
    submitPlant(peachDoc, fetchFn).catch(() => {
      peachDoc.getElementById('fig-plant-error').textContent = 'Could not reach the server.';
    });
  });
  showLime(peachDoc);
  // Hold the gate closed until the cookie check answers, so a returning fig skips screen 1.
  peachDoc.getElementById('apple-login').hidden = true;
  return resumeFigs(peachDoc, fetchFn).catch(() => {
    showScreen(peachDoc, 'gate');
    peachDoc.getElementById('pear-refusal').textContent = 'Could not reach the server.';
  });
}

// Browser start-up. Guarded so importing this file in a test does not touch a document.
if (typeof document !== 'undefined' && document.getElementById('apple-form')) {
  wireScreens(document, (input, init) => window.fetch(input, init));
}
