# HackProof

**Receipts for hackathon claims. Don't trust the README. Run it.**

Built at Daytona HackSprint Tokyo (2026-11-15).

- **Live demo (temporary, during judging):** https://adds-servers-comparison-drive.trycloudflare.com — paste a GitHub repo, or press "Run demo submission". Each run creates a real Daytona sandbox.
- **Public read-only site (always on):** https://hackproof-delta.vercel.app — the UI with our real saved receipts, plus the slides.
- **Slides:** [`docs/slides/hackproof.pdf`](docs/slides/hackproof.pdf)
- **Latest live receipt:** [`receipts/20261115063134-4f4ace.json`](receipts/20261115063134-4f4ace.json) (GitHub `main` at `6b73204`: 3 verified · 1 refuted · 2 not checkable)

## Problem

Hackathon judges get many submissions and a few minutes for each.
They cannot clone and run every project.
So a confident README can beat software that really works.

## What it does

HackProof takes one submission (a GitHub repo).
It runs the project in a new Daytona sandbox.
It finds the claims in the README.
It checks each claim by running real commands.
It gives a receipt: command, exit code, measured value, commit, sandbox id, SHA-256.

Each claim gets one verdict:

| Verdict | Meaning |
|---|---|
| `verified` | We ran the check. The result matches the claim. |
| `refuted` | We ran the check. The result does not match the claim. |
| `inconclusive` | We could not get a clear result. The receipt says why. |
| `not_checkable` | Running code cannot prove this claim (needs secrets, real users, etc.). |

The verdict comes from exit codes and measurements. It never comes from an LLM opinion.

## Evidence: a real run

Receipt: [`receipts/20261115060636-d5e519.json`](receipts/20261115060636-d5e519.json)
Input: the demo submission [`demo-submissions/acme-notes`](demo-submissions/acme-notes) in this repo, cloned from GitHub at commit `34b0248`.
Total time: 9.6 seconds. Sandbox creation: 0.6 seconds.

| Claim in the README | Check | Verdict | Evidence |
|---|---|---|---|
| `npm test` — 6 tests pass | run tests, count passes | `verified` | 6 passed, 0 failed |
| GET /health returns 200 | HTTP request in the sandbox | `verified` | status 200 |
| p50 latency under 50 ms on /notes | 20 requests, measure p50 | `verified` | p50 0.4 ms (inside the sandbox, loopback) |
| `npm test` — 12 tests pass on the full suite | run tests, count passes | `refuted` | 6 passed; the claim says 12 |
| AI summaries (requires OPENAI_API_KEY) | none | `not_checkable` | needs a secret; we never pass secrets |
| Loved by 500+ users | none | `not_checkable` | real-world usage cannot be run |

`acme-notes` is our own demo project. It contains one false claim on purpose, so there is something to refute.

## How it works

1. **Read** — read the README and the file list. A planner proposes install steps, a start command, and the claims to check.
2. **Gate** — only allow-listed commands can run (`npm install`, `npm test`, `npm start`, `npm run <script>`, `node <file>`, `python <file>`, `pip install -r requirements.txt`, `pytest`). README text never becomes a free shell command.
3. **Run** — create one Daytona sandbox for the submission. Clone, install, start, probe, measure. No secrets go inside. The sandbox is deleted at the end.
4. **Receipt** — save JSON with every step, each verdict and its evidence, and a SHA-256 of the receipt.

## Partner technologies

| Partner | How we use it | Status |
|---|---|---|
| **Daytona** | Core of the product. One disposable sandbox per submission (`@daytonaio/sdk`): create, clone, run commands, detect the app port, measure, delete. The sandbox id and timings are in every receipt. | Working. Used in every run. |
| **Nosana** | The planner can call an open model on a Nosana GPU (Ollama, `qwen2.5-coder:7b`, OpenAI-compatible API) to read the README and propose checks. Set `NOSANA_LLM_URL`. | Integrated in code. Our Nosana deployment was still starting during the event, so the run above used the built-in rule-based planner. The receipt records which planner was used (`planner.kind`). |

## Run it

```bash
npm install
cp .env.example .env        # add DAYTONA_API_KEY
npm run verify -- demo-submissions/acme-notes                 # local folder
npm run verify -- https://github.com/OWNER/REPO [subdir] [ref] # GitHub repo
npm run dev                  # web UI on http://localhost:4321
npm run test:allowlist       # self-test of the command gate
```

## What we measured before building

We first ran 10 recent public hackathon repos in Daytona sandboxes.

- Guessing the start command from files only: 1 of 10 apps came up. Most failures were wrong start commands, not broken projects.
- Following the README steps worked much better (5 repos tried: 2 served, 1 passed its tests, 2 failed). So a README-reading step is needed.
- One README said "31 checks". We got 30 of 31. The likely cause was the Python version in the sandbox, not a false claim. The right verdict is `inconclusive`.
- Our first test harness gave false positives. We added a positive control and a negative control, and threw the first numbers away.

This is a small sample. We do not claim a success rate.

## Limits

- A verdict is true for one commit and one environment.
- Latency is measured inside the sandbox on loopback. It is not production latency.
- The rule-based planner reads simple claim sentences. Free-form claims need the LLM planner.
- Claims that need secrets, GPUs, or real users are `not_checkable`.
- Real use by organizers needs consent from participants and a way to appeal a result.

## Repo layout

- `src/verifier/` — planner, command allow-list, sandbox runner, types
- `src/server.ts`, `public/index.html` — API and web UI
- `src/cli.ts` — command line
- `demo-submissions/acme-notes/` — demo submission with one false claim
- `receipts/` — saved receipts
- `docs/slides/` — slide deck
