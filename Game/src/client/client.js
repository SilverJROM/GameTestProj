// First screen for the game: a woman or man choice and a name box. The form posts
// /api/login and shows the server's refusal. On success it calls /api/me and reveals the
// papaya canvas, which draws the world map picture from the assets directory.
// Plain script, no framework. The functions take the document and fetch as arguments so a test can drive them.

import { sproutAfterLogin } from './main.ts';

const appleLoginPath = '/api/login';
const cherryMePath = '/api/me';
const melonMapPath = '/maps/world-map-wide.jpg';

// Woman is the default radio, so a gender is always sent.
function pickedGender(peachDoc) {
  return peachDoc.getElementById('lime-man').checked ? 'man' : 'woman';
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
function revealMap(peachDoc) {
  peachDoc.getElementById('apple-login').hidden = true;
  const papayaCanvas = peachDoc.getElementById('papaya-canvas');
  papayaCanvas.hidden = false;
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
}

// Browser start-up. Guarded so importing this file in a test does not touch a document.
if (typeof document !== 'undefined' && document.getElementById('apple-form')) {
  wireLogin(document, (input, init) => window.fetch(input, init));
}
