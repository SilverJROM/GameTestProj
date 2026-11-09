// Shell routes against the real worker (unstable_dev loads src/server/index.ts with the assets
// directory from wrangler.jsonc). / serves the HTML page, /client.js the script, and the map
// picture comes from the assets binding.
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { unstable_dev, type Unstable_DevWorker } from 'wrangler';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let orchardDir = '';
let worker: Unstable_DevWorker | undefined;

beforeAll(async () => {
  orchardDir = await mkdtemp(path.join(tmpdir(), 'shell-orchard-'));
  worker = await unstable_dev('src/server/index.ts', {
    config: 'wrangler.jsonc',
    persistTo: path.join(orchardDir, 'state'),
    logLevel: 'error',
    experimental: {
      disableExperimentalWarning: true,
      disableDevRegistry: true,
    },
  });
}, 120_000);

afterAll(async () => {
  await worker?.stop();
  if (orchardDir.length > 0) {
    await rm(orchardDir, { recursive: true, force: true });
  }
});

describe('shell routes on the real worker', () => {
  it('serves the first-screen page at / with one script tag', async () => {
    const response = await worker!.fetch('/');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    const pageText = await response.text();
    expect(pageText.match(/<script\b/g)?.length).toBe(1);
    expect(pageText).toContain('src="/client.js"');
    expect(pageText).toContain('id="apple-form"');
    expect(pageText).toContain('id="papaya-canvas"');
  });

  it('serves the client script at /client.js', async () => {
    const response = await worker!.fetch('/client.js');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('javascript');
    expect(await response.text()).toContain('/api/login');
  });

  it('serves the world map picture from the assets directory', async () => {
    const response = await worker!.fetch('/maps/world-map-wide.jpg');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('image/jpeg');
    const picture = new Uint8Array(await response.arrayBuffer());
    const onDisk = await readFile(new URL('../../assets/maps/world-map-wide.jpg', import.meta.url));
    expect(picture.length).toBe(onDisk.length);
    expect(picture[0]).toBe(0xff);
    expect(picture[1]).toBe(0xd8);
  });
});
