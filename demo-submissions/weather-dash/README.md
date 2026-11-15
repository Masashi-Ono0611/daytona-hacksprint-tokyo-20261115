# Weather Dash

<!-- HackProof demo fixture: the test claim below is intentionally false
     (the suite has 5 tests but one of them fails) so HackProof has something to refute. -->

**Hyperlocal forecasts for every classroom.** Weather Dash serves a 3-day forecast
from a tiny zero-dependency API that teachers can put on a classroom screen.

## Run

1. `npm install`
2. `npm start`
3. `npm test`

The server listens on `PORT` (default `3000`).

- `GET /health` — liveness check
- `GET /forecast` — 3-day forecast

## Claims

- `npm test` — 5 tests pass
- GET /health returns 200
- p50 latency under 20 ms on /forecast
- Used by 3 schools

## Team

Built in one weekend by Team Sunny.
