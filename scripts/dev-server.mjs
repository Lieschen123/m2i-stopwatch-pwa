import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const args = new Set(process.argv.slice(2));
const portArg = process.argv.indexOf('--port');
const port = portArg >= 0 ? Number(process.argv[portArg + 1]) : 5173;
if (!args.has('--dist-only')) {
  const result = spawnSync(process.execPath, ['scripts/build.mjs'], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
const types = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.webmanifest', 'application/manifest+json'],
  ['.json', 'application/json; charset=utf-8']
]);
const root = normalize(join(process.cwd(), 'dist'));
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let path = normalize(join(root, decodeURIComponent(url.pathname)));
    if (!path.startsWith(root)) throw new Error('bad path');
    if (url.pathname === '/' || !existsSync(path)) path = join(root, 'index.html');
    const body = await readFile(path);
    res.writeHead(200, { 'Content-Type': types.get(extname(path)) || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});
server.on('error', (error) => {
  console.error(`Unable to start dev server on 127.0.0.1:${port}: ${error.message}`);
  process.exit(1);
});
server.listen(port, '127.0.0.1', () => {
  console.log(`M2I Stopwatch available at http://127.0.0.1:${port}`);
});
