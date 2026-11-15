import { existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { verify } from './verifier/run.js'
import type { Source } from './verifier/types.js'

const [target, subdir] = process.argv.slice(2)
if (!target) {
  console.error('usage: npm run verify -- <local dir | https://github.com/owner/repo> [subdir]')
  process.exit(2)
}
let source: Source
if (/^https:\/\//.test(target)) source = { kind: 'git', url: target, subdir }
else {
  const dir = resolve(target, subdir ?? '')
  if (!existsSync(dir) || !statSync(dir).isDirectory()) { console.error(`not a directory: ${dir}`); process.exit(2) }
  source = { kind: 'local', dir }
}

const t0 = Date.now()
const r = await verify(source, e => console.log(`[${((e.t - t0) / 1000).toFixed(1).padStart(5)}s] ${e.msg}`))
console.log('\n=== HackProof receipt', r.id, '===')
console.log(`commit ${r.commit} | sandbox ${r.sandbox.id} | planner ${r.planner.kind} | app ${r.app.status}${r.app.port ? ` :${r.app.port}` : ''}${r.app.reason ? ` (${r.app.reason})` : ''}`)
console.table(r.claims.map(c => ({ id: c.id, verdict: c.verdict, claim: c.text.slice(0, 50), reason: c.reason.slice(0, 70) })))
console.log('summary', r.summary, '| sha256', r.sha256)
