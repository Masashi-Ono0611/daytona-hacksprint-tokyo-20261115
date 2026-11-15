import { Daytona } from '@daytonaio/sdk'
import { createHash, randomBytes } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isAllowed } from './allowlist.js'
import { plan } from './planner.js'
import type { ClaimResult, Receipt, Source, Step, VerifyEvent } from './types.js'

const HOME = '/home/daytona'
const APP = `${HOME}/app`
const APP_PORT = 3000
export const RECEIPTS_DIR = resolve(fileURLToPath(new URL('../../receipts', import.meta.url)))

const tail = (s: string, n = 600) => (s.length > n ? s.slice(-n) : s)
const sq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

type Sh = (cmd: string, cwd?: string, timeoutSec?: number) => Promise<{ rc: number; out: string; ms: number }>

export async function verify(source: Source, onEvent: (e: VerifyEvent) => void = () => {}): Promise<Receipt> {
  const t0 = Date.now()
  const startedAt = new Date(t0).toISOString()
  const id = `${startedAt.replace(/[-:.TZ]/g, '').slice(0, 14)}-${randomBytes(3).toString('hex')}`
  const log = (msg: string) => onEvent({ t: Date.now(), msg })
  const steps: Step[] = []
  const claims: ClaimResult[] = []
  let commit = 'unknown'
  let app: Receipt['app'] = { status: 'not_started' }
  let sandboxInfo = { id: '', createMs: 0 }
  let planner: Receipt['planner'] = { kind: 'heuristic' }

  // No env vars / secrets are passed into the sandbox: create({}) with no env.
  const d = new Daytona({ apiKey: process.env.DAYTONA_API_KEY, apiUrl: process.env.DAYTONA_API_URL })
  log('creating disposable Daytona sandbox')
  const tc = Date.now()
  const s = await d.create({})
  sandboxInfo = { id: s.id, createMs: Date.now() - tc }
  log(`sandbox ${s.id} ready in ${sandboxInfo.createMs} ms`)

  const sh: Sh = async (cmd, cwd = APP, to = 60) => {
    const t = Date.now()
    try {
      const r = await s.process.executeCommand(cmd, cwd, undefined, to)
      return { rc: r.exitCode, out: String(r.result ?? ''), ms: Date.now() - t }
    } catch (e: any) {
      return { rc: -1, out: 'EXEC ERROR ' + String(e?.message ?? e).slice(0, 300), ms: Date.now() - t }
    }
  }
  const step = async (name: string, cmd: string, cwd = APP, to = 60) => {
    log(`${name}: ${cmd}`)
    const r = await sh(cmd, cwd, to)
    steps.push({ name, cmd, exitCode: r.rc, ms: r.ms, outputTail: tail(r.out) })
    log(`${name}: exit ${r.rc} (${r.ms} ms)`)
    return r
  }

  try {
    // 1. fetch source
    let work = APP
    if (source.kind === 'git') {
      const br = source.ref ? `--branch ${sq(source.ref)} ` : ''
      const g = await step('clone', `git clone --depth 1 ${br}${sq(source.url)} app`, HOME, 120)
      if (g.rc !== 0) throw new Error('git clone failed')
      commit = (await sh('git rev-parse HEAD')).out.trim() || 'unknown'
      if (source.subdir) {
        if (/(^|\/)\.\.(\/|$)/.test(source.subdir) || source.subdir.startsWith('/')) throw new Error('invalid subdir')
        work = `${APP}/${source.subdir.replace(/\/+$/, '')}`
      }
    } else {
      const files = listLocal(source.dir)
      log(`uploading ${files.length} files from local dir`)
      const dirs = [...new Set(files.map(f => `${APP}/${f}`.replace(/\/[^/]+$/, '')))]
      await sh(`mkdir -p ${[APP, ...dirs].map(sq).join(' ')}`, HOME)
      const tu = Date.now()
      for (const f of files) await s.fs.uploadFile(readFileSync(join(source.dir, f)), `${APP}/${f}`)
      steps.push({ name: 'upload', cmd: `upload ${files.length} files`, exitCode: 0, ms: Date.now() - tu, outputTail: '' })
      commit = 'local'
    }
    log(`commit: ${commit}`)

    // 2. read README + file list, plan
    const readme = (await sh('cat README.md 2>/dev/null || cat readme.md 2>/dev/null || true', work)).out
    const fileList = (await sh(`find . -type f -not -path './node_modules/*' -not -path './.git/*' | head -300`, work)).out
      .split('\n').map(x => x.trim().replace(/^\.\//, '')).filter(Boolean)
    log(`README ${readme.length} chars, ${fileList.length} files; planning`)
    const p = await plan(readme, fileList)
    planner = p.planner
    log(`planner: ${p.planner.kind}${p.planner.fallbackReason ? ` (fallback: ${p.planner.fallbackReason})` : ''}; ${p.claims.length} claims`)

    // 3. install
    let installOk = true
    for (const cmd of p.install) {
      if (!isAllowed(cmd)) {
        steps.push({ name: 'install', cmd, exitCode: -2, ms: 0, outputTail: 'skipped: command not in allowlist' })
        log(`install: skipped (not in allowlist): ${cmd}`)
        installOk = false
        continue
      }
      const real = /^npm (install|ci)$/.test(cmd) ? `${cmd} --no-audit --no-fund --loglevel=error` : cmd
      const r = await step('install', real, work, 240)
      if (r.rc !== 0) installOk = false
    }

    // 4. start
    let port: number | undefined
    if (p.start) {
      if (!isAllowed(p.start.cmd)) {
        app = { status: 'fails', reason: `start command not in allowlist: ${p.start.cmd}` }
      } else {
        const portsNow = async () => (await sh(`ss -ltn | awk 'NR>1{print $4}' | sed 's/.*://' | sort -un`)).out
          .split(/\s+/).filter(x => /^\d+$/.test(x)).map(Number)
        const before = new Set(await portsNow())
        const cmd = p.start.cmd.startsWith('PORT=') ? p.start.cmd : `PORT=${APP_PORT} ${p.start.cmd}`
        await step('start', `nohup sh -c ${sq(cmd)} > /tmp/app.log 2>&1 &`, work, 15)
        const deadline = Date.now() + 45_000
        while (!port && Date.now() < deadline) {
          await sleep(2500)
          for (const pp of (await portsNow()).filter(x => !before.has(x) && x > 1023)) {
            const h = await sh(`curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:${pp}${p.start.healthPath}`)
            if (/^[1-5]\d\d$/.test(h.out.trim())) { port = pp; break }
          }
        }
        const appLog = (await sh('tail -c 600 /tmp/app.log')).out
        steps.push({ name: 'app-log', cmd: 'tail /tmp/app.log', exitCode: 0, ms: 0, outputTail: appLog })
        const lastLogLine = appLog.split('\n').map(x => x.trim()).filter(Boolean).pop()?.slice(0, 160)
        app = port ? { status: 'runs', port } : { status: 'fails', reason: `no new port answered HTTP on ${p.start.healthPath} within 45s` + (installOk ? '' : ' (install failed)') + (lastLogLine ? `; app log: ${lastLogLine}` : '') }
        log(port ? `app serving on port ${port}` : `app did not serve: ${app.reason}`)
      }
    }

    // 5. claims
    for (const c of p.claims) {
      log(`checking claim ${c.id}: ${c.text}`)
      const r = await evalClaim(c, sh, work, port, app.reason)
      claims.push(r)
      log(`claim ${c.id}: ${r.verdict} — ${r.reason}`)
    }
  } catch (e: any) {
    log(`error: ${String(e?.message ?? e)}`)
    if (app.status === 'not_started') app = { status: 'not_started', reason: String(e?.message ?? e).slice(0, 200) }
  } finally {
    log('deleting sandbox')
    await s.delete().catch(err => log(`sandbox delete failed: ${String(err?.message ?? err)}`))
  }

  const summary = { verified: 0, refuted: 0, inconclusive: 0, not_checkable: 0 }
  for (const c of claims) summary[c.verdict]++
  const finishedAt = new Date().toISOString()
  const body: Omit<Receipt, 'sha256'> = {
    id, source, commit, startedAt, finishedAt, totalMs: Date.now() - t0, sandbox: sandboxInfo, planner,
    steps, app, claims, summary,
  }
  const sha256 = createHash('sha256').update(JSON.stringify(body)).digest('hex')
  const receipt: Receipt = { ...body, sha256 }
  mkdirSync(RECEIPTS_DIR, { recursive: true })
  writeFileSync(join(RECEIPTS_DIR, `${id}.json`), JSON.stringify(receipt, null, 2))
  log(`receipt ${id} saved (sha256 ${sha256.slice(0, 12)}…)`)
  return receipt
}

async function evalClaim(c: { id: string; text: string; check: any }, sh: Sh, work: string, port?: number, appReason?: string): Promise<ClaimResult> {
  const why = appReason ? ` (${appReason})` : ''
  const ck = c.check
  const res = (verdict: ClaimResult['verdict'], reason: string, evidence?: ClaimResult['evidence']): ClaimResult =>
    ({ ...c, verdict, reason, ...(evidence ? { evidence } : {}) })

  switch (ck.kind) {
    case 'not_checkable':
      return res('not_checkable', ck.reason)
    case 'test_count':
    case 'command_exit': {
      if (!isAllowed(ck.cmd)) return res('inconclusive', 'command not in allowlist', { cmd: ck.cmd })
      const r = await sh(ck.cmd, work, 240)
      const ev = { cmd: ck.cmd, exitCode: r.rc, outputTail: tail(r.out, 800) }
      if (ck.kind === 'command_exit')
        return r.rc === 0 ? res('verified', 'command exited 0', ev) : res('refuted', `command exited ${r.rc}`, ev)
      const { passed, failed } = parseTests(r.out)
      if (passed === undefined) return res('inconclusive', `could not parse a passed-test count (exit ${r.rc})`, ev)
      const obs = `${passed} passed${failed !== undefined ? `, ${failed} failed` : ''}`
      if (r.rc === 0 && passed === ck.expectPassed) return res('verified', `${obs}; claim says ${ck.expectPassed}`, { ...ev, observed: obs })
      return res('refuted', `${obs} (exit ${r.rc}); claim says ${ck.expectPassed}`, { ...ev, observed: obs })
    }
    case 'http_status': {
      const cmd = `curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:${port ?? APP_PORT}${ck.path}`
      if (!port) return res('inconclusive', `app is not serving${why}, so the endpoint could not be requested`, { cmd })
      const r = await sh(cmd)
      const code = Number(r.out.trim())
      const ev = { cmd, exitCode: r.rc, observed: `HTTP ${r.out.trim()}` }
      if (!code) return res('inconclusive', 'no HTTP response', ev)
      return code === ck.expect ? res('verified', `GET ${ck.path} returned ${code}`, ev) : res('refuted', `GET ${ck.path} returned ${code}, claim says ${ck.expect}`, ev)
    }
    case 'latency': {
      const n = Math.min(Math.max(Number(ck.samples) || 20, 3), 50)
      const cmd = `for i in $(seq ${n}); do curl -s -o /dev/null -w '%{time_total}\\n' --max-time 10 http://127.0.0.1:${port ?? APP_PORT}${ck.path}; done`
      if (!port) return res('inconclusive', `app is not serving${why}, so latency could not be measured`, { cmd })
      const r = await sh(cmd, work, 120)
      const xs = r.out.split('\n').map(Number).filter(x => Number.isFinite(x) && x > 0).map(x => x * 1000).sort((a, b) => a - b)
      if (!xs.length) return res('inconclusive', 'no latency samples collected', { cmd, exitCode: r.rc })
      const p50 = xs[Math.floor((xs.length - 1) / 2)]
      const observed = `p50 ${p50.toFixed(1)} ms over ${xs.length} sequential requests, measured inside this sandbox (loopback; not a production network)`
      const ev = { cmd, exitCode: r.rc, observed }
      return p50 <= ck.p50MaxMs ? res('verified', `${observed} <= ${ck.p50MaxMs} ms`, ev) : res('refuted', `${observed} > ${ck.p50MaxMs} ms`, ev)
    }
    default:
      return res('inconclusive', `unknown check kind`)
  }
}

export function parseTests(out: string): { passed?: number; failed?: number } {
  const clean = out.replace(/\x1b\[[0-9;]*m/g, '')
  let m: RegExpMatchArray | null
  if ((m = clean.match(/(?:ℹ|#)\s*pass\s+(\d+)/))) {
    const f = clean.match(/(?:ℹ|#)\s*fail\s+(\d+)/)
    return { passed: +m[1], failed: f ? +f[1] : undefined }
  }
  if ((m = clean.match(/Tests:\s+(?:(\d+)\s+failed,\s+)?(?:\d+\s+skipped,\s+)?(\d+)\s+passed/)))
    return { passed: +m[2], failed: m[1] ? +m[1] : 0 }
  if ((m = clean.match(/(?:(\d+)\s+failed,\s+)?(\d+)\s+passed/)))
    return { passed: +m[2], failed: m[1] ? +m[1] : (clean.match(/(\d+)\s+failed/)?.[1] ? +clean.match(/(\d+)\s+failed/)![1] : 0) }
  return {}
}

function listLocal(root: string): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === '.git' || name === '.env' || name.startsWith('.env.')) continue
      const full = join(dir, name)
      const st = statSync(full)
      if (st.isDirectory()) walk(full)
      else if (st.isFile() && st.size < 5_000_000) out.push(relative(root, full))
      if (out.length > 2000) throw new Error('too many files in local dir')
    }
  }
  walk(root)
  return out
}
