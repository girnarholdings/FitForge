import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHistory, isFollowUp } from './history';

/**
 * The judgement these tests pin: keep the thread when the user is continuing, drop it when they
 * have moved on. Both mistakes are visible to the user — a lost thread makes "why?" nonsense, and
 * a kept thread makes an unrelated question come back about the old topic.
 */

const PRIOR = 'How much protein do I need? Aim for 1.6-2.2 g per kg of bodyweight each day.';

test('an explicit continuation is always a follow-up', () => {
  for (const q of ['why?', 'why is that', 'and carbs?', 'what about fat', 'so should I go higher?']) {
    assert.equal(isFollowUp(q, PRIOR), true, q);
  }
});

test('a very short question cannot be self-contained', () => {
  assert.equal(isFollowUp('how much?', PRIOR), true);
  assert.equal(isFollowUp('per day?', PRIOR), true);
});

test('shared vocabulary keeps the thread', () => {
  assert.equal(isFollowUp('is that protein target too high for a beginner', PRIOR), true);
});

test('a genuinely new subject drops the thread', () => {
  // No shared content words, no referential opener — this is a different conversation.
  assert.equal(isFollowUp('how do I fix my squat depth', PRIOR), false);
  assert.equal(isFollowUp('can you build me a push pull legs split', PRIOR), false);
});

test('history is built oldest-first as alternating turns', () => {
  const turns = [
    { question: 'How much protein?', answer: 'About **1.6-2.2 g/kg**.' },
    { question: 'From what foods?', answer: 'Chicken, eggs, dairy, legumes.' },
  ];
  const h = buildHistory(turns, 'why that much?');
  assert.deepEqual(
    h.map((m) => m.role),
    ['user', 'assistant', 'user', 'assistant'],
  );
  assert.equal(h[0]!.content, 'How much protein?');
  assert.match(h[3]!.content, /Chicken/);
});

test('a new subject sends no history at all', () => {
  const turns = [{ question: 'How much protein?', answer: 'About 1.6-2.2 g/kg.' }];
  assert.deepEqual(buildHistory(turns, 'how do I fix my squat depth'), []);
});

test('turns with no answer are not replayed as empty assistant messages', () => {
  // A pending or failed turn has nothing the model could use, and an empty assistant message is
  // a malformed conversation.
  const turns = [
    { question: 'How much protein?', answer: null },
    { question: 'And carbs?', answer: 'Fill the rest of your calories.' },
  ];
  const h = buildHistory(turns, 'why?');
  assert.equal(h.length, 2);
  assert.equal(h[0]!.content, 'And carbs?');
});

test('long answers are compressed, and end cleanly rather than mid-word', () => {
  const long = `${'This is a complete sentence about training volume. '.repeat(30)}`;
  const h = buildHistory([{ question: 'volume?', answer: long }], 'why?');
  const content = h[1]!.content;
  assert.ok(content.length <= 421, `compressed to ${content.length}`);
  assert.ok(/[.…]$/.test(content), 'ends on a sentence boundary or an ellipsis');
});

test('only the last three exchanges survive', () => {
  const turns = Array.from({ length: 8 }, (_, i) => ({
    question: `question about protein ${i}`,
    answer: `answer about protein ${i}`,
  }));
  const h = buildHistory(turns, 'why?');
  assert.equal(h.length, 6, 'three exchanges, two messages each');
  assert.match(h[0]!.content, /protein 5/, 'oldest kept is the third from the end');
});
