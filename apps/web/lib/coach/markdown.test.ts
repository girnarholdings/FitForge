import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCoachMarkdown, parseSpans } from './markdown';

/**
 * The renderer's contract is REFUSAL: it renders the worker's FORMAT subset and nothing else.
 * The tests that matter are the ones where a model misbehaved.
 */

test('bold spans are extracted, everything else stays plain', () => {
  const spans = parseSpans('Aim for **10-20 hard sets** per muscle per week.');
  assert.deepEqual(spans, [
    { bold: false, text: 'Aim for ' },
    { bold: true, text: '10-20 hard sets' },
    { bold: false, text: ' per muscle per week.' },
  ]);
});

test('an unclosed ** is literal text, never silently styled', () => {
  const spans = parseSpans('this **never closes');
  assert.deepEqual(spans, [{ bold: false, text: 'this **never closes' }]);
});

test('consecutive bullets group into ONE list; a blank line splits them', () => {
  const blocks = parseCoachMarkdown('Lead line.\n- one\n- two\n\n- separate');
  assert.equal(blocks.length, 3);
  assert.equal(blocks[0]!.type, 'p');
  assert.equal(blocks[1]!.type, 'ul');
  assert.equal((blocks[1] as { items: unknown[] }).items.length, 2);
  assert.equal(blocks[2]!.type, 'ul');
});

test('markdown the contract forbids falls through as literal text, not as rendering', () => {
  // A heading the worker failed to strip must not become a heading here — it stays visible
  // as odd text, which is the honest failure mode.
  const blocks = parseCoachMarkdown('## Heading\n[link](https://evil.example)');
  assert.equal(blocks.every((b) => b.type === 'p'), true);
  const text = blocks
    .flatMap((b) => (b.type === 'p' ? b.spans : []))
    .map((s) => s.text)
    .join('');
  assert.match(text, /## Heading/);
  assert.match(text, /\[link\]/, 'link syntax is inert text — there is no anchor to click');
});

test('the canonical coach answer shape parses into its three parts', () => {
  const blocks = parseCoachMarkdown(
    'Aim for **10-20** sets.\n- Split across **2** sessions\n- Keep **2 RIR**\n**Next:** add one set to bench.',
  );
  assert.equal(blocks.length, 3);
  assert.equal(blocks[0]!.type, 'p');
  assert.equal(blocks[1]!.type, 'ul');
  assert.equal(blocks[2]!.type, 'p');
  const next = blocks[2] as { spans: { bold: boolean; text: string }[] };
  assert.equal(next.spans[0]!.bold, true);
  assert.equal(next.spans[0]!.text, 'Next:');
});
