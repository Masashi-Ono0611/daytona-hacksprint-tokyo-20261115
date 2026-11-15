'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { FORECAST, toFahrenheit, averageHigh, rainyDays } = require('../forecast');

test('forecast covers 3 days', () => {
  assert.equal(FORECAST.length, 3);
});

test('0 C is 32 F', () => {
  assert.equal(toFahrenheit(0), 32);
});

test('100 C is 212 F', () => {
  assert.equal(toFahrenheit(100), 212);
});

test('only Wednesday is rainy', () => {
  assert.deepEqual(rainyDays(FORECAST), ['Wed']);
});

// Fails on purpose: (17 + 16 + 14) / 3 = 15.67 should round to 16, but averageHigh floors it to 15.
test('average high rounds to nearest degree', () => {
  assert.equal(averageHigh([{ highC: 17 }, { highC: 16 }, { highC: 14 }]), 16);
});
