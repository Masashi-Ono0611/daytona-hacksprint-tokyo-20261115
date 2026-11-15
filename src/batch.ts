import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { RECEIPTS_DIR, publicSource, verify } from './verifier/run.js'
import type { Receipt, Source } from './verifier/types.js'

// Organizer batch mode: verify several submissions at once, each in its own disposable Daytona sandbox.
// usage: npm run batch -- <local dir | https://github.com/owner/repo[#subdir]> ...

export const BATCH_CONCURRENCY = 3

export type BatchEntry = {
  source: Source
  receiptId?: string
  app?: Receipt['app']
  summary?: Receipt['summary']
  planner?: Receipt['planner']
  score?: number
  error?: string
}

export type BatchReport = { id: string; startedAt: string; finishedAt: string; totalMs: number; submissions: BatchEntry[] }

// Score is ONLY an ordering aid for the judge's table; verdicts stay per claim in each receipt.
// score = verified*2 + (app === 'runs' ? 2 : 0) - refuted*3
// (a refuted claim costs more than a verified one earns: false claims should sink a submission)
export function score(r: Pick<Receipt, 'summary' | 'app'>): number {
  return r.summary.verified * 2 + (r.app.status === 'runs' ? 2 : 0) - r.summary.refuted * 3
}

export function parseTarget(target: string): Source {
  if (/^https:\/\//.test(target)) {
    const [url, subdir] = target.split('#')
    return { kind: 'git', url, subdir: subdir || undefined }
  }
  const dir = resolve(target)
  if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new Error(`not a directory: ${dir}`)
  return { kind: 'local', dir }
}

/** Run up to `limit` jobs at once, preserving input order in the result. */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const worker = async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i], i) } }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

export function batchId(t: number): string {
  return `batch-${new Date(t).toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${randomBytes(2).toString('hex')}`
}

export function toEntry(source: Source, r: Receipt): BatchEntry {
  return { source: publicSource(source), receiptId: r.id, app: r.app, summary: r.summary, planner: r.planner, score: score(r) }
}

const label = (s: Source) => (s.kind === 'local' ? s.dir.split('/').pop()! : `${s.url}${s.subdir ? '#' + s.subdir : ''}`)

async function main() {
  const targets = process.argv.slice(2)
  if (!targets.length) {
    console.error('usage: npm run batch -- <local dir | https://github.com/owner/repo[#subdir]> ...')
    process.exit(2)
  }
  let sources: Source[]
  try { sources = targets.map(parseTarget) } catch (e: any) { console.error(String(e?.message ?? e)); process.exit(2) }

  const t0 = Date.now()
  const id = batchId(t0)
  const startedAt = new Date(t0).toISOString()
  console.log(`${id}: ${sources.length} submissions, up to ${BATCH_CONCURRENCY} sandboxes at once`)
  const submissions = await pool(sources, BATCH_CONCURRENCY, async (source): Promise<BatchEntry> => {
    const name = label(source)
    try {
      const r = await verify(source, e => console.log(`[${((e.t - t0) / 1000).toFixed(1).padStart(5)}s] ${name}: ${e.msg}`))
      return toEntry(source, r)
    } catch (e: any) {
      console.log(`${name}: error ${String(e?.message ?? e)}`)
      return { source: publicSource(source), error: String(e?.message ?? e).slice(0, 300) }
    }
  })
  const finishedAt = new Date().toISOString()
  const report: BatchReport = { id, startedAt, finishedAt, totalMs: Date.now() - t0, submissions }
  mkdirSync(RECEIPTS_DIR, { recursive: true })
  const file = join(RECEIPTS_DIR, `${id}.json`)
  writeFileSync(file, JSON.stringify(report, null, 2))

  const ranked = [...submissions].sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity))
  console.log(`\n=== HackProof batch ${id} (${(report.totalMs / 1000).toFixed(1)} s) ===`)
  console.table(ranked.map((s, i) => ({
    rank: i + 1,
    submission: label(s.source),
    score: s.score ?? 'error',
    app: s.app?.status ?? '-',
    verified: s.summary?.verified ?? '-',
    refuted: s.summary?.refuted ?? '-',
    inconclusive: s.summary?.inconclusive ?? '-',
    not_checkable: s.summary?.not_checkable ?? '-',
    planner: s.planner?.kind ?? '-',
    receipt: s.receiptId ?? s.error ?? '-',
  })))
  console.log('score = verified*2 + (app runs ? 2 : 0) - refuted*3 (ordering aid only; verdicts are per claim)')
  console.log(`batch report saved: ${file}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main()
