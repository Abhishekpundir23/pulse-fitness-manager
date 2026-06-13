import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const root = join(process.cwd(), 'dist');
const port = Number(process.env.PORT || 8082);
const mimeTypes = {
  '.css': 'text/css',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
};

createServer((request, response) => {
  const rawPath = decodeURIComponent((request.url || '/').split('?')[0]);
  const safePath = normalize(rawPath).replace(/^(\.\.[/\\])+/, '');
  let filePath = join(root, safePath === '/' ? 'index.html' : safePath);

  if (existsSync(filePath) && statSync(filePath).isDirectory()) {
    filePath = join(filePath, 'index.html');
  }
  if (!existsSync(filePath)) {
    filePath = join(root, 'index.html');
  }

  response.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Type', mimeTypes[extname(filePath)] || 'application/octet-stream');
  createReadStream(filePath).pipe(response);
}).listen(port, '127.0.0.1', () => {
  console.log(`Preview available at http://127.0.0.1:${port}`);
});

