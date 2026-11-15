# Quiz Bot

<!-- HackProof demo fixture: the app needs a Postgres DATABASE_URL to start. HackProof never
     passes secrets into the sandbox, so the server claim below cannot be checked (inconclusive). -->

**Turn any lecture into a live quiz in seconds.** Quiz Bot scores answers, keeps a
leaderboard, and stores every round in Postgres.

## Run

1. `npm install`
2. `npm start` (set DATABASE_URL to a Postgres connection string first)
3. `npm test`

The server listens on `PORT` (default `3000`).

- `GET /health` — liveness check
- `GET /quiz` — the current question

## Claims

- `npm test` — 4 tests pass
- GET /health returns 200
- Requires DATABASE_URL (Postgres)

## Team

Built in one weekend by Team Quiz.
