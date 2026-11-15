// Vercel Function: run one HackProof verification synchronously and return the receipt.
// GET  /api/verify  -> { live: true } (lets the static UI know live verification is available)
// POST /api/verify  -> { receipt, events } ; body { repoUrl?, subdir?, ref?, localDir? }
// Keys come from Vercel environment variables (DAYTONA_API_KEY, NOSANA_LLM_*); nothing is passed into the sandbox.
import type { IncomingMessage, ServerResponse } from 'node:http'
import { verify } from '../src/verifier/run.js'
import { toSource } from '../src/verifier/source.js'

export const config = { maxDuration: 300 }

function send(res: ServerResponse, code: number, body: unknown) {
  res.statusCode = code
  res.setHeader('content-type', 'application/json')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

async function readBody(req: IncomingMessage & { body?: unknown }): Promise<any> {
  if (req.body && typeof req.body === 'object') return req.body
  if (typeof req.body === 'string') return req.body ? JSON.parse(req.body) : {}
  let data = ''
  for await (const chunk of req) { data += chunk; if (data.length > 100_000) throw new Error('body too large') }
  return data ? JSON.parse(data) : {}
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'GET') return send(res, 200, { live: Boolean(process.env.DAYTONA_API_KEY), planner: process.env.NOSANA_LLM_URL ? 'nosana-llm' : 'heuristic' })
  if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' })
  if (!process.env.DAYTONA_API_KEY) return send(res, 503, { error: 'live verification is not configured on this deployment' })
  let source
  try { source = toSource(await readBody(req)) } catch (e: any) { return send(res, 400, { error: String(e?.message ?? e) }) }
  const events: { t: number; msg: string }[] = []
  try {
    const receipt = await verify(source, e => { events.push(e) })
    return send(res, 200, { receipt, events })
  } catch (e: any) {
    return send(res, 500, { error: String(e?.message ?? e).slice(0, 300), events })
  }
}
