#!/bin/bash
# Start the HackProof server with the Nosana hosted LLM planner.
# The Nosana key is read from the macOS keychain item "hackproof-nosana-inference" (never stored in files).
set -u
cd "$(dirname "$0")/.." || exit 1
NOSANA_LLM_KEY="$(security find-generic-password -s hackproof-nosana-inference -w)" || { echo "missing keychain item hackproof-nosana-inference"; exit 1; }
export NOSANA_LLM_KEY
export NOSANA_LLM_URL="https://inference.nosana.com"
export NOSANA_LLM_MODEL="qwen/qwen3.8-27b"
exec npx tsx --env-file=.env src/server.ts
