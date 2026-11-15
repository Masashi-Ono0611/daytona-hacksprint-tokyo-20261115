# Acme Notes

<!-- HackProof demo fixture: this demo submission intentionally contains ONE false claim
     (the "12 tests" line below; the suite has 6) so HackProof has something to refute. -->

**Your team's second brain, at the speed of thought.** Acme Notes is a blazing-fast,
searchable notes API built for hackathon teams who ship. Zero dependencies. Zero config.

## Run

1. `npm install`
2. `npm start`
3. `npm test`

The server listens on `PORT` (default `3000`).

- `GET /health` — liveness check
- `GET /notes` — all notes
- `GET /notes?q=term` — case-insensitive search

## Claims

- `npm test` — 6 tests pass
- GET /health returns 200
- p50 latency under 50 ms on /notes
- `npm test` — 12 tests pass on the full suite
- AI summaries powered by an external LLM (requires OPENAI_API_KEY)
- Loved by 500+ users

## Team

Built in one weekend by Team Acme.
