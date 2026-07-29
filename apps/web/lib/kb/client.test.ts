import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseModels } from './client';

/**
 * The model catalog arrives over the network from the worker's health check. The UI renders it
 * into a <select> verbatim, so the parser's contract is REFUSAL: well-shaped entries pass, and
 * everything else — wrong types, junk providers, unbounded strings, a hostile 10k-entry array —
 * is dropped or clamped before it can reach a DOM node or a request body.
 */

const good = { id: '@cf/google/gemma-3-12b-it', label: 'Gemma 3 12B', provider: 'workers-ai' };

test('a well-shaped catalog passes through', () => {
  const models = parseModels([
    { id: 'mistral-small-latest', label: 'Mistral Small · your API key', provider: 'mistral' },
    good,
  ]);
  assert.equal(models?.length, 2);
  assert.equal(models![0]!.provider, 'mistral');
});

test('junk shapes are dropped, not coerced', () => {
  const models = parseModels([
    null,
    42,
    { id: '', label: 'empty id', provider: 'workers-ai' },
    { id: 'x', label: '', provider: 'workers-ai' },
    { id: 'x', label: 'bad provider', provider: 'openai' },
    { id: 'x'.repeat(200), label: 'oversize id', provider: 'workers-ai' },
    good,
  ]);
  assert.equal(models?.length, 1);
  // `requiresAuth` is normalised in rather than passed through, so every consumer can read it as
  // a boolean without an `?? false` at each call site.
  assert.deepEqual(models![0], { ...good, requiresAuth: false });
});

test('an empty or non-array catalog reads as "no picker", not as an error', () => {
  assert.equal(parseModels([]), undefined);
  assert.equal(parseModels('nope'), undefined);
  assert.equal(parseModels(undefined), undefined);
});

test('the members-only flag survives parsing, and defaults to false', () => {
  // The picker hides `requiresAuth` entries while signed out. Losing the flag in transit would
  // silently offer the company-key model to guests — who would then be refused by the worker, so
  // the visible symptom would be "the dropdown does nothing", the worst kind of bug to diagnose.
  const models = parseModels([
    { id: 'mistral-small-latest', label: 'Mistral Small', provider: 'mistral', requiresAuth: true },
    good,
  ]);
  assert.equal(models![0]!.requiresAuth, true);
  assert.equal(models![1]!.requiresAuth, false, 'absent must read as ungated, never undefined');
});

test('a label must not claim the key belongs to the reader', () => {
  // The Mistral key is FitForge's, paid for by FitForge. Copy that calls it "your API key" invites
  // "where do I paste mine?" and misdescribes who is being billed.
  const models = parseModels([
    { id: 'mistral-small-latest', label: 'Mistral Small', provider: 'mistral', requiresAuth: true },
  ]);
  assert.doesNotMatch(models![0]!.label, /your (api )?key/i);
});

test('a hostile catalog is clamped: 12 entries max, labels cut to 60 chars', () => {
  const flood = Array.from({ length: 500 }, (_, i) => ({
    id: `m-${i}`,
    label: 'L'.repeat(300),
    provider: 'workers-ai',
  }));
  const models = parseModels(flood);
  assert.equal(models?.length, 12);
  assert.equal(models![0]!.label.length, 60);
});
