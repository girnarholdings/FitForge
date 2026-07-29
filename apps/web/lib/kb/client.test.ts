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
  assert.deepEqual(models![0], good);
});

test('an empty or non-array catalog reads as "no picker", not as an error', () => {
  assert.equal(parseModels([]), undefined);
  assert.equal(parseModels('nope'), undefined);
  assert.equal(parseModels(undefined), undefined);
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
