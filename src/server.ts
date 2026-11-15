import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'
import { RECEIPTS_DIR, verify } from './verifier/run.js'
import { toSource } from './verifier/source.js'
import type { Receipt, Source, VerifyEvent } from './verifier/types.js'
import { BATCH_CONCURRENCY, pool } from './batch.js'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const PUBLIC = join(ROOT, 'public')
const DEMOS = join(ROOT, 'demo-submissions')
const PORT = Number(process.env.PORT ?? 4321)

type Run = { status: 'running' | 'done' | 'error'; events: VerifyEvent[]; receipt?: Receipt; error?: string }
const runs = new Map<string, Run>()

const BATCH_MAX_ITEMS = 5
type BatchItem = { status: 'queued' | 'running' | 'done' | 'error'; receipt?: Receipt; error?: string }
type Batch = { status: 'running' | 'done'; items: BatchItem[] }
const batches = new Map<string, Batch>()

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
}

function json(res: ServerResponse, code: number, body: unknown) {
  res.writeHead(code, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

async function readBody(req: IncomingMessage): Promise<any> {
  let data = ''
  for await (const chunk of req) { data += chunk; if (data.length > 100_000) throw new Error('body too large') }
  return data ? JSON.parse(data) : {}
}


function listReceipts() {
  if (!existsSync(RECEIPTS_DIR)) return []
  // batch-*.json are batch reports (src/batch.ts), not receipts
  return readdirSync(RECEIPTS_DIR).filter(f => f.endsWith('.json') && !f.startsWith('batch-')).flatMap(f => {
    try {
      const r: Receipt = JSON.parse(readFileSync(join(RECEIPTS_DIR, f), 'utf8'))
      return [{ id: r.id, source: r.source, commit: r.commit, startedAt: r.startedAt, finishedAt: r.finishedAt, totalMs: r.totalMs, app: r.app, summary: r.summary, sha256: r.sha256 }]
    } catch { return [] }
  }).sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
}

function serveStatic(pathname: string, res: ServerResponse) {
  const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '')
  const file = resolve(PUBLIC, rel)
  if (!file.startsWith(PUBLIC + sep) || !existsSync(file) || !statSync(file).isFile()) return json(res, 404, { error: 'not found' })
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
  res.end(readFileSync(file))
}

createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url ?? '/', 'http://x')
    if (req.method === 'POST' && pathname === '/api/verify') {
      let source: Source
      try { source = toSource(await readBody(req)) } catch (e: any) { return json(res, 400, { error: String(e?.message ?? e) }) }
      const id = randomBytes(6).toString('hex')
      const run: Run = { status: 'running', events: [] }
      runs.set(id, run)
      verify(source, e => run.events.push(e))
        .then(r => { run.receipt = r; run.status = 'done' })
        .catch(e => { run.status = 'error'; run.error = String(e?.message ?? e) })
      return json(res, 202, { id })
    }
    if (req.method === 'POST' && pathname === '/api/batch') {
      let sources: Source[]
      try {
        const b = await readBody(req)
        if (!Array.isArray(b?.items) || b.items.length < 1) throw new Error('items must be a non-empty array')
        if (b.items.length > BATCH_MAX_ITEMS) throw new Error(`at most ${BATCH_MAX_ITEMS} items per batch`)
        sources = b.items.map((it: any, i: number) => { try { return toSource(it) } catch (e: any) { throw new Error(`item ${i}: ${e?.message ?? e}`) } })
      } catch (e: any) { return json(res, 400, { error: String(e?.message ?? e) }) }
      const id = randomBytes(6).toString('hex')
      const batch: Batch = { status: 'running', items: sources.map(() => ({ status: 'queued' })) }
      batches.set(id, batch)
      pool(sources, BATCH_CONCURRENCY, async (source, i) => {
        batch.items[i].status = 'running'
        try { batch.items[i] = { status: 'done', receipt: await verify(source) } }
        catch (e: any) { batch.items[i] = { status: 'error', error: String(e?.message ?? e) } }
      }).then(() => { batch.status = 'done' })
      return json(res, 202, { id })
    }
    let m: RegExpMatchArray | null
    if (req.method === 'GET' && (m = pathname.match(/^\/api\/batches\/([\w-]+)$/))) {
      const b = batches.get(m[1])
      return b ? json(res, 200, b) : json(res, 404, { error: 'unknown batch' })
    }
    if (req.method === 'GET' && (m = pathname.match(/^\/api\/runs\/([\w-]+)$/))) {
      const r = runs.get(m[1])
      return r ? json(res, 200, r) : json(res, 404, { error: 'unknown run' })
    }
    if (req.method === 'GET' && pathname === '/api/receipts') return json(res, 200, listReceipts())
    if (req.method === 'GET' && (m = pathname.match(/^\/api\/receipts\/([\w-]+)$/))) {
      const f = join(RECEIPTS_DIR, `${m[1]}.json`)
      return existsSync(f) ? (res.writeHead(200, { 'content-type': 'application/json' }), res.end(readFileSync(f))) : json(res, 404, { error: 'unknown receipt' })
    }
    if (req.method === 'GET') return serveStatic(pathname, res)
    json(res, 405, { error: 'method not allowed' })
  } catch (e: any) {
    json(res, 500, { error: String(e?.message ?? e) })
  }
}).listen(PORT, () => console.log(`HackProof on http://localhost:${PORT}`))
