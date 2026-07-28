import { createReadStream } from 'node:fs';

/**
 * Incremental scanner for USDA FoodData Central JSON dumps.
 *
 * Extracted from import-usda.mjs so it can be unit-tested. It is the piece that was silently
 * broken for the entire life of that importer — the docstring said the array was "scanned
 * incrementally" while the code called `JSON.parse(await readFile(f, 'utf8'))` — and the only
 * thing that would ever have caught it is a test that feeds it more data than one chunk.
 *
 * Plain .mjs rather than .ts because import-usda.mjs runs under bare `node`, with no tsx in the
 * loader chain; the tests import this same file through tsx.
 */
/** Top-level array property names FDC uses, in the order we try them. */
export const ARRAY_KEYS = ['FoundationFoods', 'SRLegacyFoods', 'BrandedFoods', 'foods'];

/**
 * Yield the objects of one top-level array from an FDC JSON file, WITHOUT loading the file.
 *
 * This is the part the old code only claimed to do. It said the array was "scanned incrementally"
 * and then called `JSON.parse(await readFile(f, 'utf8'))` — a whole-file read. Foundation (12 MB)
 * and SR Legacy (35 MB) survive that; branded does not. Unpacked it is 3.3 GB, and Node refuses
 * with ERR_FS_FILE_TOO_LARGE above 2 GiB, so the import died on its third dataset every single
 * run. Raising the buffer limit would not help either — the intermediate string would still blow
 * past V8's ~512 MB maximum string length.
 *
 * The scanner walks characters tracking string/escape state and brace depth, slicing out each
 * complete depth-1 object and parsing only that. Consumed text is dropped from the buffer as it
 * goes, so peak memory is one object plus one chunk regardless of file size. Reading with an
 * encoding set means Node's StringDecoder handles multi-byte characters split across chunk
 * boundaries; decoding chunks by hand would corrupt any food name outside ASCII.
 *
 * Keyed rather than "first array in the file" so the offline fixture — which deliberately carries
 * all four shapes in one document — exercises this exact code path. A streaming parser that only
 * the un-runnable network path uses is a streaming parser nobody has tested.
 */
export async function* streamArrayObjects(filePath, key) {
  const stream = createReadStream(filePath, { encoding: 'utf8', highWaterMark: 1 << 20 });
  const needle = `"${key}"`;
  let buf = '';
  let phase = 'key'; // key → open → objects
  let depth = 0;
  let inString = false;
  let escaped = false;
  let objStart = -1;
  // Cursor into `buf`; survives chunk boundaries so nothing is ever scanned twice.
  let scan = 0;

  try {
    for await (const chunk of stream) {
      buf += chunk;

      if (phase === 'key') {
        let from = 0;
        for (;;) {
          const at = buf.indexOf(needle, from);
          if (at === -1) {
            // Keep a tail as long as the needle so a key split across two chunks still matches.
            if (buf.length > needle.length) buf = buf.slice(-needle.length);
            scan = 0;
            break;
          }
          // It must be a PROPERTY key, i.e. followed by a colon. A bare `indexOf` would also
          // match a data VALUE equal to the key name — a food described exactly as "foods" would
          // send the scanner off into whatever array came next.
          const rest = buf.slice(at + needle.length);
          const after = rest.replace(/^\s*/, '');
          if (after === '') {
            // Undecidable until more input arrives; keep the candidate and re-test next chunk.
            buf = buf.slice(at);
            scan = 0;
            break;
          }
          if (after[0] === ':') {
            buf = after.slice(1);
            scan = 0;
            phase = 'open';
            break;
          }
          from = at + needle.length;
        }
        if (phase === 'key') continue;
      }

      if (phase === 'open') {
        const at = buf.indexOf('[');
        if (at === -1) {
          buf = '';
          continue;
        }
        buf = buf.slice(at + 1);
        scan = 0;
        phase = 'objects';
      }

      // `scan` PERSISTS ACROSS CHUNKS, and must. An earlier version restarted at 0 on every chunk
      // while carrying `depth`/`inString` over, so the retained head of a half-read object was
      // scanned twice: its opening brace counted again, depth never returned to 0 at the right
      // place, and the slice handed to JSON.parse ran on into the following object. That surfaced
      // only after ~4,300 rows — one 1 MB chunk in — which is precisely the region no test
      // reached before this one.
      while (scan < buf.length) {
        const ch = buf[scan];
        if (inString) {
          if (escaped) escaped = false;
          else if (ch === '\\') escaped = true;
          else if (ch === '"') inString = false;
          scan += 1;
          continue;
        }
        if (ch === '"') {
          inString = true;
          scan += 1;
          continue;
        }
        if (ch === '{') {
          if (depth === 0) objStart = scan;
          depth += 1;
          scan += 1;
          continue;
        }
        if (ch === '}') {
          depth -= 1;
          scan += 1;
          if (depth === 0 && objStart >= 0) {
            yield JSON.parse(buf.slice(objStart, scan));
            objStart = -1;
          }
          continue;
        }
        // The array's own closing bracket, at object depth 0 and outside any string: done.
        if (ch === ']' && depth === 0) return;
        scan += 1;
      }

      // Compact ONCE PER CHUNK, not once per object. Slicing the buffer after every object made
      // this quadratic — ~4,000 objects per chunk each copying most of a megabyte — which turned a
      // 3.3 GB dataset from slow into never-finishing.
      const keepFrom = objStart >= 0 ? objStart : scan;
      if (keepFrom > 0) {
        buf = buf.slice(keepFrom);
        scan -= keepFrom;
        if (objStart >= 0) objStart = 0;
      }
    }
  } finally {
    stream.destroy();
  }
}
