'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { QUESTIONS, score, leaderboard } = require('../quiz');

test('has 3 questions', () => {
  assert.equal(QUESTIONS.length, 3);
});

test('correct answer scores 1', () => {
  assert.equal(score(QUESTIONS[1], 1), 1);
});

test('wrong answer scores 0', () => {
  assert.equal(score(QUESTIONS[1], 0), 0);
});

test('leaderboard sums points and sorts descending', () => {
  const board = leaderboard([
    { player: 'kai', points: 1 },
    { player: 'mio', points: 1 },
    { player: 'mio', points: 1 },
  ]);
  assert.deepEqual(board, [{ player: 'mio', points: 2 }, { player: 'kai', points: 1 }]);
});
