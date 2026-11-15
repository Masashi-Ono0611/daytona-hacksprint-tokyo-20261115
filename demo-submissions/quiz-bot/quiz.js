'use strict';

const QUESTIONS = [
  { id: 1, q: 'What does HTTP stand for?', choices: ['HyperText Transfer Protocol', 'High Transfer Text Process'], answer: 0 },
  { id: 2, q: 'Which port is HTTPS by default?', choices: ['80', '443'], answer: 1 },
  { id: 3, q: 'Is JSON a subset of JavaScript syntax?', choices: ['Yes', 'No'], answer: 0 },
];

function score(question, choice) {
  return question.answer === choice ? 1 : 0;
}

function leaderboard(results) {
  const totals = new Map();
  for (const { player, points } of results) totals.set(player, (totals.get(player) || 0) + points);
  return [...totals.entries()]
    .map(([player, points]) => ({ player, points }))
    .sort((a, b) => b.points - a.points || a.player.localeCompare(b.player));
}

module.exports = { QUESTIONS, score, leaderboard };
