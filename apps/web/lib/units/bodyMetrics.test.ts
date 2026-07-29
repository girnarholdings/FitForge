/**
 * The parser's whole promise is "type it your way and be understood correctly" — so these tests
 * are the notations real people type, plus the misreadings that would be catastrophic if allowed
 * (180 lb stored as 180 kg is not a bug, it is a fictional person).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHeight, parseWeight, heightUnit, weightUnit } from './bodyMetrics';

const cm = (raw: string, pref = 'cm') => parseHeight(raw, pref)?.value ?? null;
const kg = (raw: string, pref = 'kg') => parseWeight(raw, pref)?.value ?? null;

test("5'10 in every notation people actually use lands on the same height", () => {
  for (const t of ["5'10", '5\'10"', '5’10', '5 ft 10', '5ft10', '5 feet 10 in', '5-10']) {
    assert.equal(cm(t), 177.8, t);
  }
});

test('feet alone, no inches', () => {
  assert.equal(cm("6'"), 182.9);
  assert.equal(cm('6 ft'), 182.9);
});

test('metric heights, with and without a stated unit', () => {
  assert.equal(cm('178'), 178);
  assert.equal(cm('178cm'), 178);
  assert.equal(cm('178 cm'), 178);
  assert.equal(cm('1.78m'), 178);
  // dropdown on metres reads a bare decimal as metres
  assert.equal(cm('1.78', 'm'), 178);
});

test('a bare number is read in the dropdown unit — until that describes nobody', () => {
  // 70 with an inches dropdown: 70in = 177.8cm
  assert.equal(cm('70', 'in'), 177.8);
  // 70 with a cm dropdown cannot be an adult height in cm... but IS in this range guard? 70cm is
  // outside 54-272? No — 70 cm is inside the wide bounds (they admit verified extremes), so the
  // dropdown's own reading stands. The guard is for impossibility, not improbability.
  assert.equal(cm('70', 'cm'), 70);
  // 300 as cm is beyond any verified human — falls through to inches? 300in=762cm also absurd;
  // 300cm absurd; no reading fits → null rather than an invented body.
  assert.equal(cm('300', 'cm'), null);
});

test('explicit unit in the text overrides the dropdown', () => {
  assert.equal(cm('70in', 'cm'), 177.8);
  assert.equal(kg('180lb', 'kg'), 81.6);
  assert.equal(kg('82kg', 'lb'), 82);
});

test('weights people type', () => {
  assert.equal(kg('82'), 82);
  assert.equal(kg('82.5 kg'), 82.5);
  assert.equal(kg('180 lbs'), 81.6);
  assert.equal(kg('180.5lb'), 81.9);
});

test('stones, the UK way', () => {
  assert.equal(kg('12st 7'), 79.4);
  assert.equal(kg('12 stone 7lb'), 79.4);
  assert.equal(kg('12.5st'), 79.4);
  assert.equal(kg('12st'), 76.2);
});

test('a bare imperial-dropdown number reads as pounds', () => {
  assert.equal(kg('180', 'lb'), 81.6);
});

test('garbage is refused, not guessed at', () => {
  for (const t of ['', '  ', 'tall', "5'10 maybe", '1.2.3', '-70']) {
    assert.equal(cm(t), null, `height ${JSON.stringify(t)}`);
    assert.equal(kg(t), null, `weight ${JSON.stringify(t)}`);
  }
});

test('the dictionary renders canonical values back in every unit', () => {
  assert.equal(heightUnit('ftin').format(177.8), '5′10″');
  assert.equal(heightUnit('cm').format(177.8), '178 cm');
  assert.equal(heightUnit('m').format(178), '1.78 m');
  assert.equal(weightUnit('lb').format(81.6), '179.9 lb');
  assert.equal(weightUnit('st').format(79.4), '12 st 7 lb');
});

test('rounding at unit seams never shows 12 inches or 14 pounds', () => {
  // 182.87cm ≈ 71.997in → naive floor/round would print 5′12″
  assert.equal(heightUnit('ftin').format(182.87), '6′0″');
  // 88.90kg ≈ 195.99lb = 13st 13.99lb → naive round would print 13 st 14 lb
  assert.equal(weightUnit('st').format(88.9), '14 st 0 lb');
});
