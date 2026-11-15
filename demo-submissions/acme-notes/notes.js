'use strict';

const SEED_NOTES = [
  { id: 1, title: 'Hackathon kickoff', body: 'Form teams and pick a sandbox provider.' },
  { id: 2, title: 'Pitch outline', body: 'Problem, demo, why now, ask.' },
  { id: 3, title: 'Grocery list', body: 'Coffee, onigiri, more coffee.' },
  { id: 4, title: 'Demo checklist', body: 'Charge laptop, test projector, rehearse the demo.' },
  { id: 5, title: 'Retro', body: 'What went well: shipping. What to improve: sleep.' },
];

function listNotes(notes = SEED_NOTES) {
  return notes.map((n) => ({ ...n }));
}

function searchNotes(notes, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return listNotes(notes);
  return notes
    .filter((n) => n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q))
    .map((n) => ({ ...n }));
}

module.exports = { SEED_NOTES, listNotes, searchNotes };
