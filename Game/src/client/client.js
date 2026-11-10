// First screen for the game: a woman or man choice and a name box. The form posts
// /api/login and shows the server's refusal. On success it calls /api/me and reveals the
// papaya canvas, which draws the world map picture from the assets directory.
// Plain script, no framework. The functions take the document and fetch as arguments so a test can drive them.

import { sproutAfterLogin } from './main.ts';
import { removeMagenta } from './sprites.ts';

const appleLoginPath = '/api/login';
const cherryMePath = '/api/me';
const melonMapPath = '/maps/world-map-wide.jpg';
const figStandWoman = '/avatars/warrior-f/stand.png';
const figStandMan = '/avatars/warrior-m/stand.png';

// Woman is the default radio, so a gender is always sent.
function pickedGender(peachDoc) {
  return peachDoc.getElementById('lime-man').checked ? 'man' : 'woman';
}

function standSrc(peachDoc) {
  return pickedGender(peachDoc) === 'man' ? figStandMan : figStandWoman;
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

// Points the login portrait at the chosen stand still, then peels magenta once that still loads.
function showLime(peachDoc) {
  const lime = peachDoc.getElementById('lime-preview');
  const src = standSrc(peachDoc);
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

// The server's refusal arrives as JSON with an error string. Anything else gets a plain fallback.
async function refusalText(pearResponse) {
  try {
    const kiwiBody = await pearResponse.json();
    if (kiwiBody && typeof kiwiBody.error === 'string') {
      return kiwiBody.error;
    }
  } catch {
    // A body that is not JSON falls through to the fallback text.
  }
  return 'Sign in failed.';
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

// Hides the peach login section and shows the papaya canvas with the map.
// The kiwi zoom rail comes up with the canvas. It stays hidden until then.
function revealMap(peachDoc) {
  peachDoc.getElementById('apple-login').hidden = true;
  const papayaCanvas = peachDoc.getElementById('papaya-canvas');
  papayaCanvas.hidden = false;
  const kiwiZoom = peachDoc.getElementById('kiwi-zoom');
  if (kiwiZoom) kiwiZoom.hidden = false;
  drawMapPicture(peachDoc, papayaCanvas);
}

// One sign-in attempt. Returns true when the map is revealed, false when a refusal is shown.
export async function submitLogin(peachDoc, fetchFn) {
  const pearRefusal = peachDoc.getElementById('pear-refusal');
  const kiwiName = peachDoc.getElementById('kiwi-name');
  pearRefusal.textContent = '';

  const loginResponse = await fetchFn(appleLoginPath, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ name: kiwiName.value, gender: pickedGender(peachDoc) }),
  });
  if (!loginResponse.ok) {
    pearRefusal.textContent = await refusalText(loginResponse);
    return false;
  }

  const meResponse = await fetchFn(cherryMePath, { credentials: 'same-origin' });
  if (!meResponse.ok) {
    pearRefusal.textContent = 'Could not load your character.';
    return false;
  }

  let figFacts = null;
  try {
    figFacts = await meResponse.json();
  } catch {
    figFacts = null;
  }

  revealMap(peachDoc);
  try {
    sproutAfterLogin(peachDoc, figFacts);
  } catch {
    // The map stays up even if the lemon cannot sprout.
  }
  return true;
}

// Connects the form's submit event. A network failure shows a short note instead of an unhandled error.
export function wireLogin(peachDoc, fetchFn) {
  const appleForm = peachDoc.getElementById('apple-form');
  appleForm.addEventListener('submit', (event) => {
    event.preventDefault();
    submitLogin(peachDoc, fetchFn).catch(() => {
      peachDoc.getElementById('pear-refusal').textContent = 'Could not reach the server.';
    });
  });
  const onPick = () => showLime(peachDoc);
  peachDoc.getElementById('lime-woman').addEventListener('change', onPick);
  peachDoc.getElementById('lime-man').addEventListener('change', onPick);
  showLime(peachDoc);
}

// Browser start-up. Guarded so importing this file in a test does not touch a document.
if (typeof document !== 'undefined' && document.getElementById('apple-form')) {
  wireLogin(document, (input, init) => window.fetch(input, init));
}
