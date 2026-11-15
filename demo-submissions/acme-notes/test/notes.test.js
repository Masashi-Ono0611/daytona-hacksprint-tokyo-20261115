'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { SEED_NOTES, listNotes, searchNotes } = require('../notes');

test('seed has 5 notes', () => {
  assert.equal(SEED_NOTES.length, 5);
});

test('listNotes returns copies, not references', () => {
  const list = listNotes();
  list[0].title = 'mutated';
  assert.notEqual(SEED_NOTES[0].title, 'mutated');
});

test('search matches title case-insensitively', () => {
  const r = searchNotes(SEED_NOTES, 'PITCH');
  assert.deepEqual(r.map((n) => n.id), [2]);
});

test('search matches body text', () => {
  const r = searchNotes(SEED_NOTES, 'coffee');
  assert.deepEqual(r.map((n) => n.id), [3]);
});

test('empty query returns everything', () => {
  assert.equal(searchNotes(SEED_NOTES, '').length, 5);
  assert.equal(searchNotes(SEED_NOTES, undefined).length, 5);
});

test('no match returns empty list', () => {
  assert.deepEqual(searchNotes(SEED_NOTES, 'zzz-no-such-note'), []);
});
