// Seeks composition.html frame by frame and writes PNGs.
//   node capture.mjs <outDir> all            → every frame at 30fps (0000.png …)
//   node capture.mjs <outDir> 1.2 4.5 9      → stills at those times (t1.2.png …)
// Run inside mcr.microsoft.com/playwright (see README.md).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const FPS = 30, DUR = 20;
const [outDir, ...args] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const here = path.dirname(fileURLToPath(import.meta.url));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(pathToFileURL(path.join(here, 'composition.html')).href + '?t=0');
await page.evaluate(() => window.__ready);

const times = args[0] === 'all'
  ? Array.from({ length: FPS * DUR }, (_, i) => i / FPS)
  : args.map(Number);

for (const [i, t] of times.entries()) {
  await page.evaluate(t => window.render(t), t);
  const name = args[0] === 'all' ? String(i).padStart(4, '0') : `t${t}`;
  await page.screenshot({ path: path.join(outDir, `${name}.png`) });
  if (args[0] === 'all' && i % 60 === 0) console.log(`frame ${i}/${times.length}`);
}
await browser.close();
