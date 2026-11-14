import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createStudioPages} from '../src/studio-pages.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
test('studios share one origin while preserving their asset boundaries', async t => {
  const studios = createStudioPages(root, {local:false});
  const server = http.createServer(async (req, res) => {
    if (!await studios.handle(req, res, new URL(req.url, 'http://localhost'))) {
      res.writeHead(404); res.end();
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { studios.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const [route, target] of [['/podcast','/src/character-studio/lab.html'], ['/vox','/src/vox-paper/create.html']]) {
    const redirect = await fetch(origin + route + '?style=notion-doodle', {redirect:'manual'});
    assert.equal(redirect.status, 302);
    assert.equal(redirect.headers.get('location'), target + '?style=notion-doodle');
    const page = await fetch(origin + route);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type'), /text\/html/);
  }
  for (const asset of ['/src/character-studio/lab.js', '/src/character-story/render.js',
    '/src/vox-paper/lab.js', '/public/fonts/comfortaa-bold.ttf',
    '/azerbaijan-startups-vox/paper-transitions-demo/node_modules/three/build/three.module.js']) {
    assert.equal((await fetch(origin + asset)).status, 200, asset);
  }
  for (const forbidden of ['/src/config.js', '/.env', '/src/character-studio/%2e%2e%2f%2e%2e%2f.env',
    '/azerbaijan-startups-vox/paper-transitions-demo/node_modules/three/build/%2e%2e%2fpackage.json']) {
    assert.equal((await fetch(origin + forbidden)).status, 404, forbidden);
  }
  // The new page routes must not turn the local speech worker into a public API.
  assert.equal((await fetch(origin + '/api/speech/status')).status, 503);
});
