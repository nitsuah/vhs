// Seeks compose.html frame by frame and writes PNGs. Serves promo/ over http
// so the shell and the locked ../brag-20s/composition.html are same-origin.
//   node capture.mjs <promoDir> <outDir> all          → every frame (0000.png …)
//   node capture.mjs <promoDir> <outDir> 1.2 4.5 9    → stills (t1.2.png …)
// Run inside mcr.microsoft.com/playwright (build.sh does).
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const [promoDir, outDir, ...args] = process.argv.slice(2);
const spot = JSON.parse(readFileSync(path.join(promoDir, 'brag-20s-vert/spot.json'), 'utf8'));
mkdirSync(outDir, { recursive: true });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json' };
const root = path.resolve(promoDir);
const server = createServer((req, res) => {
  let file;
  try { file = path.join(root, path.normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname))); }
  catch { res.writeHead(400); return res.end(); }
  if (!file.startsWith(root + path.sep) || !existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(0);
const port = server.address().port;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: spot.width, height: spot.height } });
await page.addInitScript((s) => { window.SPOT = s; }, spot);
await page.goto(`http://127.0.0.1:${port}/brag-20s-vert/compose.html`);
await page.evaluate(() => window.ready);

const times = args[0] === 'all'
  ? Array.from({ length: Math.round(spot.fps * spot.duration) }, (_, i) => i / spot.fps)
  : args.map(Number);

for (const [i, t] of times.entries()) {
  await page.evaluate((t) => window.render(t), t);
  const name = args[0] === 'all' ? String(i).padStart(4, '0') : `t${t}`;
  await page.screenshot({ path: path.join(outDir, `${name}.png`) });
  if (args[0] === 'all' && i % 60 === 0) console.log(`frame ${i}/${times.length}`);
}
await browser.close();
server.close();
