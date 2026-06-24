import { build } from '/Users/lieschen/.nvm/versions/node/v22.22.0/lib/node_modules/openclaw/node_modules/esbuild/lib/main.js';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { statSync, readFileSync } from 'node:fs';

const basePathInput = process.env.BASE_PATH || process.env.GITHUB_PAGES_BASE || '/';
const basePath = `/${basePathInput.replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/');
const assetPath = (path) => `${basePath === '/' ? '/' : basePath}${path.replace(/^\/+/, '')}`;

await rm('dist', { recursive: true, force: true });
await mkdir('dist/assets', { recursive: true });
await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  minify: true,
  sourcemap: false,
  format: 'esm',
  target: ['es2022'],
  outfile: 'dist/assets/main.js',
  logLevel: 'silent'
});
await cp('public', 'dist', { recursive: true });
let html = readFileSync('index.html', 'utf8')
  .replace('href="/manifest.webmanifest"', `href="${assetPath('manifest.webmanifest')}"`)
  .replace('href="/icon.svg"', `href="${assetPath('icon.svg')}"`)
  .replace('<script type="module" src="/src/main.js"></script>', `<link rel="stylesheet" href="${assetPath('assets/main.css')}" />\n    <script type="module" src="${assetPath('assets/main.js')}"></script>`);
await writeFile('dist/index.html', html);
const manifest = JSON.parse(readFileSync('dist/manifest.webmanifest', 'utf8'));
manifest.start_url = basePath;
manifest.scope = basePath;
manifest.icons = manifest.icons.map((icon) => ({ ...icon, src: assetPath(icon.src) }));
await writeFile('dist/manifest.webmanifest', `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile('dist/_headers', `/*\n  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src wss://*; manifest-src 'self'; worker-src 'self'; base-uri 'self'; form-action 'self'\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  Permissions-Policy: geolocation=(self), microphone=(), camera=(), payment=()\n`);
const js = readFileSync('dist/assets/main.js');
const bytes = statSync('dist/assets/main.js').size;
const gzipBytes = gzipSync(js).length;
console.log(`base path ${basePath}`);
console.log(`dist/assets/main.js ${bytes} bytes (${gzipBytes} gzip bytes)`);
if (gzipBytes > 250 * 1024) {
  throw new Error(`Bundle exceeds 250KB gzip target: ${gzipBytes}`);
}
