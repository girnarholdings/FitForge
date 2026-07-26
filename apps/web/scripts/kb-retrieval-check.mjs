/**
 * Retrieval sanity harness for the offline knowledge base.
 *
 *   node apps/web/scripts/kb-retrieval-check.mjs
 *
 * Compiles the PURE retrieval modules (`text.ts`, `search.ts`, `route.ts` — none of which import
 * `faq.json`) to CommonJS in a temp dir, loads `faq.json` from disk, and prints the top match,
 * confidence and routed mode for a set of realistic user questions. This exercises the exact
 * code the browser runs; nothing here re-implements the algorithm.
 *
 * Pass `-v` to also print the runner-up entries for each question.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, '..');
const KB = path.join(WEB, 'lib', 'kb');
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'fitforge-kb-'));

execFileSync(
  process.execPath,
  [
    path.join(WEB, '..', '..', 'node_modules', 'typescript', 'bin', 'tsc'),
    path.join(KB, 'text.ts'),
    path.join(KB, 'search.ts'),
    path.join(KB, 'route.ts'),
    '--outDir',
    OUT,
    '--module',
    'commonjs',
    '--target',
    'es2022',
    '--moduleResolution',
    'node',
    '--skipLibCheck',
  ],
  { stdio: 'inherit' },
);

const require_ = createRequire(import.meta.url);
const { buildKbIndex, searchIndex } = require_(path.join(OUT, 'search.js'));
const { routeQuery } = require_(path.join(OUT, 'route.js'));

const entries = JSON.parse(fs.readFileSync(path.join(KB, 'faq.json'), 'utf8'));
const t0 = process.hrtime.bigint();
const index = buildKbIndex(entries);
const buildMs = Number(process.hrtime.bigint() - t0) / 1e6;

/** Realistic questions spanning all three routing paths, including a deliberate typo. */
const QUESTIONS = [
  'how much protein',
  'my knee hurts when I squat',
  'how many days should I train',
  "what if I don't have a bench",
  'why am I not losing weight',
  'will lifting make me bulky',
  'is creatine safe',
  'how much protien do I need',        // typo → edit-distance-1 rescue
  'what is progressive overload',
  'can I work out at home without any equipment',
  'how do I lose belly fat',
  'im 55 and want to start lifting',   // stated age → AI
  'should I do cardio before or after lifting',
  'how do I get toned without getting big',
  'what should I do if I am sore',
  'how long does it take',              // genuinely ambiguous → disambiguate
  'do I need supplements',              // topically broad → disambiguate
];

const verbose = process.argv.includes('-v');

const pad = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n));
const rows = [];

for (const q of QUESTIONS) {
  const hits = searchIndex(index, q, 5);
  const route = routeQuery(q, hits);
  rows.push({ q, route, hits });
}

const W_Q = 42;
const W_M = 34;
console.log(
  `\nindex: ${entries.length} entries · ${index.idf.size} stems · built in ${buildMs.toFixed(1)} ms\n`,
);
console.log(`${pad('QUERY', W_Q)} ${pad('TOP MATCH (entry id)', W_M)} ${'CONF'.padStart(5)}  MODE`);
console.log('-'.repeat(W_Q + W_M + 22));

for (const { q, route, hits } of rows) {
  const top = route.top;
  console.log(
    `${pad(q, W_Q)} ${pad(top ? top.entry.id : '—', W_M)} ${route.conf.toFixed(2).padStart(5)}  ${route.mode}${
      route.cues.length ? `  [${route.cues.join('; ')}]` : ''
    }`,
  );
  if (top) console.log(`${' '.repeat(W_Q)} → "${top.entry.question}"`);
  if (verbose) {
    for (const h of hits.slice(1, 4)) {
      console.log(`${' '.repeat(W_Q)}   · ${h.conf.toFixed(2)} ${h.entry.id} — ${h.entry.question}`);
    }
  }
}

/* Self-check: every curated question must retrieve ITSELF at conf 1.00 and route to `answer`. */
let selfOk = 0;
const selfFail = [];
for (const e of entries) {
  const hits = searchIndex(index, e.question, 3);
  const r = routeQuery(e.question, hits);
  if (r.top?.entry.id === e.id && r.mode === 'answer') selfOk += 1;
  else selfFail.push(`${e.id} → ${r.top?.entry.id ?? '—'} (${r.conf.toFixed(2)}, ${r.mode})`);
}

/* Alias check: every alias should retrieve its own entry in the top 3. */
let aliasTotal = 0;
let aliasTop1 = 0;
let aliasTop3 = 0;
for (const e of entries) {
  for (const a of e.aliases) {
    aliasTotal += 1;
    const hits = searchIndex(index, a, 3);
    if (hits[0]?.entry.id === e.id) aliasTop1 += 1;
    if (hits.some((h) => h.entry.id === e.id)) aliasTop3 += 1;
  }
}

const modes = rows.reduce((a, r) => ({ ...a, [r.route.mode]: (a[r.route.mode] ?? 0) + 1 }), {});
console.log(
  `\nrouting spread: ${Object.entries(modes)
    .map(([m, n]) => `${m}=${n}`)
    .join(' · ')}`,
);
console.log(`self-retrieval: ${selfOk}/${entries.length} questions answer themselves at conf 1.00`);
if (selfFail.length) console.log('  misses: ' + selfFail.join(', '));
console.log(
  `alias recall:   top-1 ${aliasTop1}/${aliasTotal} (${((aliasTop1 / aliasTotal) * 100).toFixed(0)}%) · top-3 ${aliasTop3}/${aliasTotal} (${((aliasTop3 / aliasTotal) * 100).toFixed(0)}%)`,
);

fs.rmSync(OUT, { recursive: true, force: true });
