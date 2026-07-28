import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error — plain .mjs, deliberately untyped: import-usda.mjs runs under bare `node`.
import { streamArrayObjects } from '../lib/stream-json.mjs';

/**
 * THE SCANNER THAT THE IMPORTER'S DOCSTRING LIED ABOUT.
 *
 * `import-usda.mjs` claimed for its whole life that FDC arrays were "scanned incrementally" while
 * actually calling `JSON.parse(await readFile(f, 'utf8'))`. Foundation (12 MB) and SR Legacy
 * (35 MB) tolerated that, so the fixture and every local run passed. Branded does not: unpacked it
 * is 3.3 GB and Node refuses anything over 2 GiB with ERR_FS_FILE_TOO_LARGE, so the tier-2 build
 * failed on every single deploy and shipped the 509-food core instead of 50k foods.
 *
 * The reason it survived so long is that nothing ever fed the parser more than one chunk. These
 * tests do, which is the only property that actually distinguishes a streaming parser from a
 * `readFile` wrapper.
 */

const HWM = 1 << 20; // must match the scanner's highWaterMark for the boundary tests to mean anything

function withTempFile(contents: string, run: (path: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'fdc-'));
  const path = join(dir, 'data.json');
  writeFileSync(path, contents);
  return run(path).finally(() => rmSync(dir, { recursive: true, force: true }));
}

async function collect(path: string, key: string): Promise<unknown[]> {
  const out: unknown[] = [];
  for await (const row of streamArrayObjects(path, key)) out.push(row);
  return out;
}

test('reads every object of the keyed array', async () => {
  const doc = { BrandedFoods: [{ fdcId: 1 }, { fdcId: 2 }, { fdcId: 3 }] };
  await withTempFile(JSON.stringify(doc), async (p) => {
    assert.deepEqual(await collect(p, 'BrandedFoods'), doc.BrandedFoods);
  });
});

test('picks the requested array, not merely the first one in the document', async () => {
  // The importer asks for four keys in turn against one fixture document; a scanner that locked
  // onto "the first [" would return Foundation rows every time and silently trebly-count them.
  const doc = {
    FoundationFoods: [{ fdcId: 'f1' }],
    SRLegacyFoods: [{ fdcId: 's1' }, { fdcId: 's2' }],
    BrandedFoods: [{ fdcId: 'b1' }],
  };
  await withTempFile(JSON.stringify(doc), async (p) => {
    assert.deepEqual(await collect(p, 'FoundationFoods'), doc.FoundationFoods);
    assert.deepEqual(await collect(p, 'SRLegacyFoods'), doc.SRLegacyFoods);
    assert.deepEqual(await collect(p, 'BrandedFoods'), doc.BrandedFoods);
  });
});

test('yields nothing for a key the document does not contain', async () => {
  await withTempFile(JSON.stringify({ FoundationFoods: [{ fdcId: 1 }] }), async (p) => {
    assert.deepEqual(await collect(p, 'BrandedFoods'), []);
  });
});

test('a string equal to the key name is not mistaken for the key', async () => {
  // `"foods"` is one of the keys probed, and it is also a plausible food description. Matching on
  // the bare token would send the scanner into whatever array followed the value.
  const doc = {
    FoundationFoods: [{ fdcId: 1, description: 'foods' }],
    foods: [{ fdcId: 'real' }],
  };
  await withTempFile(JSON.stringify(doc), async (p) => {
    assert.deepEqual(await collect(p, 'foods'), doc.foods);
  });
});

test('survives braces, brackets and escapes inside string values', async () => {
  const doc = {
    BrandedFoods: [
      { description: '{not an object}' },
      { description: '[not an array]' },
      { description: 'he said "hi"' },
      { description: 'back\\slash' },
      { description: 'trailing backslash before quote: \\' },
      { description: '{"nested":"json","as":"a string"}' },
    ],
  };
  await withTempFile(JSON.stringify(doc), async (p) => {
    assert.deepEqual(await collect(p, 'BrandedFoods'), doc.BrandedFoods);
  });
});

test('handles nested objects and arrays within a row', async () => {
  const doc = {
    BrandedFoods: [
      { fdcId: 1, foodNutrients: [{ nutrient: { id: 1008 }, amount: 52 }], labelNutrients: {} },
      { fdcId: 2, deep: { a: { b: { c: [1, [2, [3, {}]]] } } } },
    ],
  };
  await withTempFile(JSON.stringify(doc), async (p) => {
    assert.deepEqual(await collect(p, 'BrandedFoods'), doc.BrandedFoods);
  });
});

test('reads an array far larger than one stream chunk', async () => {
  // THE REGRESSION TEST. A `readFile` implementation passes every case above; this is the one it
  // cannot fake, because correctness here depends on carrying parser state across chunk reads.
  const rows = Array.from({ length: 12_000 }, (_, i) => ({
    fdcId: i,
    description: `Food ${i} ${'padding '.repeat(25)}`,
  }));
  const json = JSON.stringify({ BrandedFoods: rows });
  const bytes = Buffer.byteLength(json);
  assert.ok(bytes > HWM * 2, `fixture must span multiple chunks (got ${bytes} bytes)`);
  await withTempFile(json, async (p) => {
    const got = await collect(p, 'BrandedFoods');
    assert.equal(got.length, rows.length);
    assert.deepEqual(got, rows);
  });
});

test('multi-byte characters split across a chunk boundary are not corrupted', async () => {
  // Decoding chunks by hand rather than letting the stream do it mangles any name outside ASCII,
  // and FDC descriptions carry plenty (café, jalapeño, 日本語). Padding is varied so the boundary
  // lands mid-character for some run of these.
  const rows = Array.from({ length: 8000 }, (_, i) => ({
    fdcId: i,
    description: `café jalapeño 日本語 🍎 ${'ü'.repeat(i % 97)}`,
  }));
  const json = JSON.stringify({ BrandedFoods: rows });
  // BYTES, not code units: the stream's highWaterMark is a byte budget, and these rows are full of
  // multi-byte characters, so `json.length` would overstate how far the fixture actually reaches.
  const bytes = Buffer.byteLength(json);
  assert.ok(bytes > HWM, `fixture must span a chunk boundary (got ${bytes} bytes)`);
  await withTempFile(json, async (p) => {
    assert.deepEqual(await collect(p, 'BrandedFoods'), rows);
  });
});

test('a key split across a chunk boundary is still found', async () => {
  // The key is only located by scanning text, so the buffer must retain enough tail between reads
  // for a name straddling two chunks to match.
  const filler = Array.from({ length: 2000 }, (_, i) => ({ fdcId: i, pad: 'x'.repeat(600) }));
  const doc = { FoundationFoods: filler, BrandedFoods: [{ fdcId: 'found-me' }] };
  const json = JSON.stringify(doc);
  assert.ok(Buffer.byteLength(json) > HWM, 'BrandedFoods must sit beyond the first chunk');
  await withTempFile(json, async (p) => {
    assert.deepEqual(await collect(p, 'BrandedFoods'), [{ fdcId: 'found-me' }]);
  });
});

test('stopping early releases the file handle', async () => {
  // `ingest` breaks out as soon as the branded cap is reached, which finalises the generator. If
  // that path did not destroy the stream, a 3.3 GB read would be left dangling.
  const rows = Array.from({ length: 3000 }, (_, i) => ({ fdcId: i, pad: 'y'.repeat(400) }));
  const json = JSON.stringify({ BrandedFoods: rows });
  assert.ok(Buffer.byteLength(json) > HWM, 'fixture must span a chunk boundary');
  await withTempFile(json, async (p) => {
    let seen = 0;
    for await (const _row of streamArrayObjects(p, 'BrandedFoods')) {
      seen += 1;
      if (seen === 5) break;
    }
    assert.equal(seen, 5);
  });
});

test('whitespace between the key, the colon and the array is tolerated', async () => {
  await withTempFile('{\n  "BrandedFoods"  :  [\n    { "fdcId": 7 }\n  ]\n}', async (p) => {
    assert.deepEqual(await collect(p, 'BrandedFoods'), [{ fdcId: 7 }]);
  });
});

test('an empty array yields nothing rather than hanging', async () => {
  await withTempFile(JSON.stringify({ BrandedFoods: [], foods: [{ fdcId: 1 }] }), async (p) => {
    assert.deepEqual(await collect(p, 'BrandedFoods'), []);
  });
});
