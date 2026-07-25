/**
 * Phone-viewport fit harness (390 × 664, the iPhone-Safari-with-chrome viewport the user
 * complained about).
 *
 * For every screen it reports:
 *   - documentElement.scrollHeight vs clientHeight (does the PAGE scroll at all?)
 *   - the primary CTA's bounding box, and whether it is fully inside the first 664px
 *   - the inner `.scroll-region` scrollHeight vs clientHeight (bounded shells move scrolling
 *     into a region, so page height alone no longer proves the content fits)
 *
 * Usage:
 *   npx --yes serve apps/web/out -l 4599
 *   node apps/web/scripts/measure-viewport.mjs [--json out.json] [--label before]
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

const EXECUTABLE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.MEASURE_BASE ?? 'http://localhost:4599';
const VIEWPORT = { width: 390, height: 664 };

/** `cta` is a list of candidate selectors, first match wins. */
const SCREENS = [
  { name: 'landing', path: '/', cta: ['button:has-text("Start in Local Mode")'] },
  {
    name: 'onboarding-welcome',
    path: '/onboarding/welcome/',
    cta: ['button:has-text("Get started")'],
  },
  { name: 'onboarding-goals', path: '/onboarding/goals/', cta: ['[data-testid=onboarding-continue]'] },
  {
    name: 'onboarding-equipment',
    path: '/onboarding/equipment/',
    cta: ['[data-testid=onboarding-continue]'],
  },
  { name: 'onboarding-split', path: '/onboarding/split/', cta: ['[data-testid=onboarding-continue]'] },
  { name: 'login', path: '/login/', cta: ['[data-testid=enter-demo]'] },
  // Interactive phases of the equipment step — the WS-1 `position:fixed; 100svh` overlays that
  // sit on top of the WS-2 bounded shell. Highest-risk cross-workstream interaction.
  {
    name: 'equipment-deck (overlay)',
    path: '/onboarding/equipment/',
    setup: async (p) => {
      await p.locator('[data-testid=equipment-preset-home]').click();
      await p.locator('[data-testid=equipment-swipe-remaining]').click();
      await p.waitForSelector('[data-testid=equipment-deck-screen]');
    },
    cta: ['[data-testid=swipe-action-right]', '[data-testid=equipment-category-all]'],
  },
  {
    name: 'equipment-review (overlay)',
    path: '/onboarding/equipment/',
    setup: async (p) => {
      await p.locator('[data-testid=equipment-preset-home]').click();
      await p.waitForSelector('[data-testid=equipment-review-screen]');
    },
    cta: ['[data-testid=onboarding-continue]'],
  },
];

const args = process.argv.slice(2);
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const label = args.includes('--label') ? args[args.indexOf('--label') + 1] : 'measurement';
const shotDir = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;

const browser = await chromium.launch({ executablePath: EXECUTABLE });
const context = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();

const results = [];

for (const screen of SCREENS) {
  await page.goto(BASE + screen.path, { waitUntil: 'networkidle' });
  // Client-only steps (onboarding provider, split recommendations) need a frame to settle.
  await page.waitForTimeout(600);
  if (screen.setup) {
    await screen.setup(page);
    await page.waitForTimeout(400);
  }

  const doc = await page.evaluate(() => {
    const de = document.documentElement;
    const region = document.querySelector('.scroll-region');
    // `.screen` is overflow:hidden — if IT overflows, content is CLIPPED and unreachable, which
    // page-level scrollHeight can never reveal. That is the failure mode worth catching.
    const clipped = [];
    for (const el of document.querySelectorAll('.screen, [data-testid=equipment-deck-screen], [data-testid=equipment-review-screen]')) {
      const over = el.scrollHeight - el.clientHeight;
      if (over > 1) clipped.push({ sel: el.className.slice(0, 40), over });
    }
    return {
      scrollHeight: de.scrollHeight,
      clientHeight: de.clientHeight,
      bodyScrollHeight: document.body.scrollHeight,
      regionScrollHeight: region ? region.scrollHeight : null,
      regionClientHeight: region ? region.clientHeight : null,
      clipped,
      url: location.pathname,
    };
  });

  let cta = null;
  let ctaSelector = null;
  for (const sel of screen.cta) {
    const el = page.locator(sel).first();
    if ((await el.count()) > 0) {
      ctaSelector = sel;
      cta = await el.boundingBox();
      if (cta) break;
    }
  }

  const ctaVisible = cta ? cta.y >= 0 && cta.y + cta.height <= VIEWPORT.height : false;

  if (shotDir) {
    fs.mkdirSync(shotDir, { recursive: true });
    await page.screenshot({ path: path.join(shotDir, `${label}-${screen.name}.png`) });
  }

  results.push({
    screen: screen.name,
    path: screen.path,
    pageScrollHeight: doc.scrollHeight,
    pageClientHeight: doc.clientHeight,
    pageOverflow: doc.scrollHeight - doc.clientHeight,
    regionScrollHeight: doc.regionScrollHeight,
    regionClientHeight: doc.regionClientHeight,
    regionOverflow:
      doc.regionScrollHeight != null ? doc.regionScrollHeight - doc.regionClientHeight : null,
    ctaSelector,
    ctaBox: cta ? { x: Math.round(cta.x), y: Math.round(cta.y), w: Math.round(cta.width), h: Math.round(cta.height) } : null,
    ctaBottom: cta ? Math.round(cta.y + cta.height) : null,
    ctaVisibleWithoutScrolling: ctaVisible,
    clippedContent: doc.clipped,
  });
}

await browser.close();

const pad = (s, n) => String(s).padEnd(n);
console.log(`\n=== ${label} · viewport 390×664, dpr 2, isMobile ===\n`);
console.log(
  `${pad('screen', 22)}${pad('page sh/ch', 14)}${pad('region sh/ch', 15)}${pad('CTA bottom', 12)}CTA visible`,
);
console.log('-'.repeat(78));
for (const r of results) {
  console.log(
    pad(r.screen, 22) +
      pad(`${r.pageScrollHeight}/${r.pageClientHeight}`, 14) +
      pad(r.regionScrollHeight != null ? `${r.regionScrollHeight}/${r.regionClientHeight}` : '—', 15) +
      pad(r.ctaBottom ?? 'MISSING', 12) +
      (r.ctaVisibleWithoutScrolling ? 'YES' : 'NO') +
      (r.clippedContent.length ? `   CLIPPED ${JSON.stringify(r.clippedContent)}` : ''),
  );
}
console.log('');

if (jsonOut) {
  fs.writeFileSync(jsonOut, JSON.stringify({ label, viewport: VIEWPORT, results }, null, 2));
  console.log(`wrote ${jsonOut}`);
}

const broken = results.filter((r) => !r.ctaVisibleWithoutScrolling || r.clippedContent.length > 0);
if (broken.length) {
  console.log(`FAIL: ${broken.map((b) => b.screen).join(', ')}`);
  process.exitCode = 1;
} else {
  console.log('OK: every primary CTA is inside the first 664px.');
}
