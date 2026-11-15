# HackProof — evidence for each judging criterion

This page is written for judges, including AI judges. Every statement links to a file or a receipt in this repository. Numbers come from saved receipts, not from estimates.

## One-line summary

HackProof runs a hackathon submission for real and checks what its README claims. Nosana's model reads the README and plans the checks. A fresh Daytona sandbox runs the project. Each claim gets a verdict from exit codes and measurements, with a receipt.

## 1. Innovation

- **Receipts, not opinions.** The verdict for each claim comes from an exit code or a measured value. The LLM only proposes what to check. See `evalClaim` in [`src/verifier/run.ts`](../src/verifier/run.ts).
- **Four honest verdicts:** `verified`, `refuted`, `inconclusive`, `not_checkable`. Unknown is never turned into pass or fail.
- **Command gate.** README text never becomes a free shell command. Only allow-listed commands run: [`src/verifier/allowlist.ts`](../src/verifier/allowlist.ts) (self-test: `npm run test:allowlist`, 33 cases).
- **Tamper-evident receipt.** Each receipt stores the commit, sandbox id, commands, exit codes, output tails and a SHA-256 of the receipt.

## 2. Completeness (working MVP)

It works end to end today, three ways:

| Way | How to try | Evidence |
|---|---|---|
| Public read-only site | https://hackproof-delta.vercel.app | Shows our saved real receipts and the slides |
| Web UI (live) | `scripts/dev-nosana.sh` then open http://localhost:4321 | Receipt [`20261115065249-39e5cb`](../receipts/20261115065249-39e5cb.json) was produced through the public live demo URL |
| CLI | `npm run verify -- https://github.com/OWNER/REPO [subdir] [ref]` | Receipt [`20261115065056-ac165b`](../receipts/20261115065056-ac165b.json) |

Real run on GitHub `main` (receipt `20261115065249-39e5cb`, planner `nosana-llm`, 26.2 s):

| Claim in the README | Verdict | Evidence |
|---|---|---|
| `npm test` — 6 tests pass | verified | 6 passed, 0 failed |
| GET /health returns 200 | verified | HTTP 200 inside the sandbox |
| p50 latency under 50 ms on /notes | verified | p50 measured inside the sandbox (loopback) |
| `npm test` — 12 tests pass on the full suite | refuted | 6 passed; the README says 12 |
| AI summaries (requires OPENAI_API_KEY) | not_checkable | needs a secret; HackProof never passes secrets |
| Loved by 500+ users | not_checkable | real-world usage cannot be run |

The input is our own demo project [`demo-submissions/acme-notes`](../demo-submissions/acme-notes), which contains one false claim on purpose.

**Organizer batch mode** — check several submissions at once, each in its own Daytona sandbox (up to 3 in parallel): `npm run batch -- <dir-or-github-url> ...` or `POST /api/batch`. Real batch with the Nosana planner, report [`batch-20261115072512-d89a`](../receipts/batch-20261115072512-d89a.json), 63.4 s for 3 submissions:

| Submission (our own demos) | App | Verified | Refuted | Inconclusive | Not checkable | Receipt |
|---|---|---|---|---|---|---|
| [`acme-notes`](../demo-submissions/acme-notes) | runs | 3 | 1 | 0 | 2 | [`20261115072512-dc5eaa`](../receipts/20261115072512-dc5eaa.json) |
| [`weather-dash`](../demo-submissions/weather-dash) — README says 5 tests pass, one fails | runs | 2 | 1 | 0 | 1 | [`20261115072512-68f527`](../receipts/20261115072512-68f527.json) |
| [`quiz-bot`](../demo-submissions/quiz-bot) — needs DATABASE_URL, so the app cannot start without secrets | fails | 1 | 0 | 1 | 1 | [`20261115072512-498489`](../receipts/20261115072512-498489.json) |

For `quiz-bot`, "GET /health returns 200" is `inconclusive`, not `refuted`: the app did not start because HackProof never passes secrets, so the claim could not be tested. The batch report orders submissions by a simple score (verified×2, +2 if the app runs, −3 per refuted claim); it is only an ordering aid, and every verdict stays per claim.

## 3. Real-life problem solving

- **Problem:** judges get many projects and a few minutes for each. They cannot clone and run every repo, so a confident README can beat software that really works.
- **What HackProof gives a judge:** for each claim, the command that was run, its exit code, the measured value, and a clear verdict, in about 10–30 seconds per submission.
- **Measured before building:** we first ran 10 recent public hackathon repos in Daytona sandboxes. Guessing the start command from files alone brought up only 1 of 10; following the README worked much better. That is why a README-reading planner is part of the design.
- **Limits we state openly:** a verdict holds for one commit and one environment; latency is measured inside the sandbox; claims needing secrets, GPUs or real users are `not_checkable`; real use needs participant consent and an appeal path.

## 4. Sponsored product usage

| Sponsor | What we use | Where in the code | Proof |
|---|---|---|---|
| **Daytona** | Core. One disposable sandbox per submission via `@daytonaio/sdk`: create, clone, install, start, find the app port, measure, delete. | [`src/verifier/run.ts`](../src/verifier/run.ts) | Every receipt has `sandbox.id` and `sandbox.createMs` (about 0.6 s). Daytona audit log screenshot: [`docs/slides/assets/daytona-dashboard.png`](slides/assets/daytona-dashboard.png) |
| **Nosana** | Nosana hosted inference (`https://inference.nosana.com/v1`, OpenAI-compatible), model `qwen/qwen3.8-27b`, billed from Nosana credits. It reads the README and proposes install steps, the start command and the checkable claims. | [`src/verifier/planner.ts`](../src/verifier/planner.ts) | Receipts `20261115065249-39e5cb` and `20261115065056-ac165b` record `planner.kind = "nosana-llm"` and the model name |

If Nosana is unreachable, HackProof falls back to a rule-based planner and records the reason in `planner.fallbackReason`.

## Files to read first

- [`README.md`](../README.md) — overview, how to run
- [`src/verifier/run.ts`](../src/verifier/run.ts) — sandbox runner and verdicts
- [`src/verifier/planner.ts`](../src/verifier/planner.ts) — Nosana planner and rule-based fallback
- [`src/verifier/allowlist.ts`](../src/verifier/allowlist.ts) — command gate
- [`receipts/`](../receipts) — real receipts
- [`docs/slides/hackproof.pdf`](slides/hackproof.pdf) — slides
