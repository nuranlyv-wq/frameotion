import path from 'node:path';
import {readFile, realpath} from 'node:fs/promises';
import {createSpeechService} from './character-speech/service.js';
import {createVoxService} from './vox-paper/service.js';

// Serve the existing studios on the platform origin, with the same asset boundaries
// as their standalone development servers. Never expose the workspace itself.
const prefixes = ['/src/character-studio/', '/src/character-story/', '/src/vox-paper/',
  '/public/fonts/', '/azerbaijan-startups-vox/assets/',
  '/azerbaijan-startups-vox/paper-transitions-demo/node_modules/three/build/'];
const types = {'.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.ttf':'font/ttf', '.woff':'font/woff',
  '.jpg':'image/jpeg', '.png':'image/png', '.svg':'image/svg+xml'};
const destinations = new Map([['/podcast', '/src/character-studio/lab.html'],
  ['/vox', '/src/vox-paper/create.html']]);

export function createStudioPages(root, {local = true} = {}) {
  const speech = local ? createSpeechService(root) : null;
  const vox = createVoxService(root, {enabled:local});
  return {
    async handle(req, res, url) {
      if (await vox.handle(req,res,url)) return true;
      if (url.pathname.startsWith('/api/speech/')) {
        if (speech) return speech.handle(req, res, url);
        res.writeHead(503, {'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store'});
        res.end(JSON.stringify({error:'Анализ записи доступен в локальной подкаст-студии.'}));
        return true;
      }
      if (req.method !== 'GET') return false;
      if (destinations.has(url.pathname)) {
        res.writeHead(302, {Location:destinations.get(url.pathname) + url.search});
        res.end();
        return true;
      }
      const pathname = decodeURIComponent(url.pathname);
      if (!prefixes.some(prefix => pathname.startsWith(prefix))) return false;
      try {
        if (pathname.split('/').some(part => part.startsWith('.'))) throw Error('Forbidden');
        const file = await realpath(path.resolve(root, '.' + pathname));
        if (!prefixes.some(prefix => file.startsWith(path.resolve(root, '.' + prefix) + path.sep))) throw Error('Forbidden');
        const data = await readFile(file);
        res.writeHead(200, {'Content-Type':types[path.extname(file)] ?? 'application/octet-stream',
          'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'});
        res.end(data);
      } catch {
        res.writeHead(404, {'Content-Type':'text/plain; charset=utf-8'});
        res.end('Not found');
      }
      return true;
    },
    close() { speech?.close(); vox.close(); },
  };
}
