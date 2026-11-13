// A tiny static file server with no dependencies: `npm start`.
// ES modules cannot be loaded from file://, so the demo must be served over http.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.env.PORT) || 5173;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.md': 'text/plain; charset=utf-8'
};

createServer(async (req, res) => {
  try {
    let pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (pathname === '/') pathname = '/demo/index.html';
    let file = normalize(join(root, pathname));
    if (!file.startsWith(root)) throw Object.assign(new Error('outside'), { code: 'FORBIDDEN' });
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch (err) {
    res.writeHead(err.code === 'FORBIDDEN' ? 403 : 404, { 'Content-Type': 'text/plain' });
    res.end(err.code === 'FORBIDDEN' ? 'Forbidden' : 'Not found');
  }
}).listen(port, () => console.log(`Reflex demo running at http://localhost:${port}/`));
