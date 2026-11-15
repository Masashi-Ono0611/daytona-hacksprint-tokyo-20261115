import type { Check, Claim, Plan } from './types.js'

// The planner only PROPOSES commands and claims. Verdicts are decided later by execution.

export async function plan(readme: string, files: string[]): Promise<Plan> {
  const url = process.env.NOSANA_LLM_URL
  if (!url) return heuristicPlan(readme, files)
  const model = process.env.NOSANA_LLM_MODEL
  let host = ''
  try { host = new URL(url).host } catch {}
  try {
    const p = await llmPlan(url, model, readme, files)
    return { ...p, planner: { kind: 'nosana-llm', model, host } }
  } catch (e: any) {
    const h = heuristicPlan(readme, files)
    h.planner.fallbackReason = `nosana-llm failed: ${String(e?.message ?? e).slice(0, 200)}`
    h.planner.model = model
    h.planner.host = host
    return h
  }
}

const PROMPT = `You read a hackathon project's README and file list and output ONLY a JSON object (no prose, no markdown) of this exact shape:
{"install": string[], "start": {"cmd": string, "healthPath": string} | null, "claims": [{"id": string, "text": string, "check": CHECK}]}
CHECK is one of:
{"kind":"test_count","cmd":string,"expectPassed":number}
{"kind":"http_status","path":string,"expect":number}
{"kind":"latency","path":string,"samples":number,"p50MaxMs":number}
{"kind":"command_exit","cmd":string}
{"kind":"not_checkable","reason":string}
Rules: commands must be plain (e.g. "npm install", "npm test", "npm start", "node server.js", "python app.py", "pip install -r requirements.txt", "pytest"), no pipes, no shell operators, no secrets.
Extract every factual claim the README makes about the project. Claims needing API keys, real users/customers, or comparisons without a reproducible command are not_checkable with a reason.
The app will be started with PORT=3000. healthPath is a path that should answer HTTP when the app is up.`

async function llmPlan(base: string, model: string | undefined, readme: string, files: string[]): Promise<Omit<Plan, 'planner'>> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (process.env.NOSANA_LLM_KEY) headers.authorization = `Bearer ${process.env.NOSANA_LLM_KEY}`
  const res = await fetch(`${base.replace(/\/$/, '')}/v1/chat/completions`, {
    method: 'POST', headers, signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({
      model, temperature: 0,
      messages: [
        { role: 'system', content: PROMPT },
        { role: 'user', content: `FILES:\n${files.slice(0, 200).join('\n')}\n\nREADME:\n${readme.slice(0, 12000)}` },
      ],
    }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const j: any = await res.json()
  const text: string = j?.choices?.[0]?.message?.content ?? ''
  return normalize(parseJson(text))
}

function parseJson(text: string): any {
  let t = text.replace(/```(?:json)?/gi, '').trim()
  const a = t.indexOf('{'), b = t.lastIndexOf('}')
  if (a < 0 || b < a) throw new Error('no JSON object in LLM output')
  return JSON.parse(t.slice(a, b + 1))
}

function normalize(o: any): Omit<Plan, 'planner'> {
  if (!o || typeof o !== 'object') throw new Error('LLM output not an object')
  const install = Array.isArray(o.install) ? o.install.filter((x: any) => typeof x === 'string') : []
  const start = o.start && typeof o.start.cmd === 'string'
    ? { cmd: o.start.cmd, healthPath: typeof o.start.healthPath === 'string' && o.start.healthPath.startsWith('/') ? o.start.healthPath : '/' }
    : undefined
  if (!Array.isArray(o.claims)) throw new Error('LLM output has no claims array')
  const claims: Claim[] = []
  o.claims.forEach((c: any, i: number) => {
    const check = normCheck(c?.check)
    if (check) claims.push({ id: `c${i + 1}`, text: String(c?.text ?? '').slice(0, 300), check })
  })
  return { install, start, claims }
}

function normCheck(c: any): Check | null {
  if (!c || typeof c !== 'object') return null
  const num = (v: any) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v))
  const path = (v: any) => (typeof v === 'string' && v.startsWith('/') ? v : null)
  switch (c.kind) {
    case 'test_count': return typeof c.cmd === 'string' && Number.isFinite(num(c.expectPassed)) ? { kind: 'test_count', cmd: c.cmd, expectPassed: num(c.expectPassed) } : null
    case 'http_status': return path(c.path) && Number.isFinite(num(c.expect)) ? { kind: 'http_status', path: c.path, expect: num(c.expect) } : null
    case 'latency': return path(c.path) && Number.isFinite(num(c.p50MaxMs)) ? { kind: 'latency', path: c.path, samples: Math.min(Math.max(num(c.samples) || 20, 3), 50), p50MaxMs: num(c.p50MaxMs) } : null
    case 'command_exit': return typeof c.cmd === 'string' ? { kind: 'command_exit', cmd: c.cmd } : null
    case 'not_checkable': return { kind: 'not_checkable', reason: String(c.reason ?? 'not checkable').slice(0, 200) }
    default: return null
  }
}

// ---------- heuristic planner (no LLM) ----------

export function heuristicPlan(readme: string, files: string[]): Plan {
  const has = (f: string) => files.some(x => x.replace(/^\.\//, '') === f)
  const install: string[] = []
  if (has('package.json')) install.push('npm install')
  if (has('requirements.txt')) install.push('pip install -r requirements.txt')

  const ticks = [...readme.matchAll(/`([^`\n]+)`/g)].map(m => m[1].trim())
  const startCmd = ticks.find(t => /^(?:PORT=\d+ )?(?:npm start|npm run dev|node [\w./-]+\.m?js|python3? [\w./-]+\.py)$/.test(t))
  const testCmd = ticks.find(t => /^(?:npm test|pytest|npm run test)$/.test(t)) ?? (has('package.json') ? 'npm test' : has('requirements.txt') ? 'pytest' : 'npm test')

  const lines = readme.split('\n')
  const candidates: string[] = []
  let inClaims = false
  for (const raw of lines) {
    const l = raw.trim()
    const h = /^#{1,6}\s+(.*)$/.exec(l)
    if (h) { inClaims = /claim/i.test(h[1]); continue }
    const bullet = /^(?:[-*+]|\d+[.)])\s+(.*)$/.exec(l)
    if (inClaims && bullet) candidates.push(bullet[1])
    else if (bullet && (matchCheck(bullet[1], testCmd)?.kind ?? 'not_checkable') !== 'not_checkable') candidates.push(bullet[1])
  }
  const seen = new Set<string>()
  const claims: Claim[] = []
  for (const text of candidates) {
    if (seen.has(text)) continue
    seen.add(text)
    const check = matchCheck(text, testCmd) ?? { kind: 'not_checkable', reason: 'no executable check could be derived from this claim' }
    claims.push({ id: `c${claims.length + 1}`, text: text.replace(/\*\*/g, '').slice(0, 300), check })
  }
  const firstHttp = claims.find(c => c.check.kind === 'http_status' || c.check.kind === 'latency')?.check as any
  const start = startCmd ? { cmd: startCmd, healthPath: firstHttp?.path ?? '/' } : undefined
  return { planner: { kind: 'heuristic' }, install, start, claims }
}

function matchCheck(textRaw: string, testCmd: string): Check | null {
  const text = textRaw.replace(/[*`]/g, '')
  let m: RegExpExecArray | null
  if ((m = /\b(\d+)\s+(?:unit |integration |e2e )?tests?\s+(?:all\s+)?pass/i.exec(text)))
    return { kind: 'test_count', cmd: testCmd, expectPassed: Number(m[1]) }
  if (/p50/i.test(text) && (m = /(?:under|below|<|less than)\s*(\d+(?:\.\d+)?)\s*ms/i.exec(text))) {
    const p = /(\/[\w\/.-]*)/.exec(text)
    if (p) return { kind: 'latency', path: p[1], samples: 20, p50MaxMs: Number(m[1]) }
  }
  if ((m = /\b(?:GET|HEAD)\s+(\/[\w\/.-]*)\s+(?:returns|responds with|gives)\s+(?:HTTP\s+)?(\d{3})\b/i.exec(text)))
    return { kind: 'http_status', path: m[1], expect: Number(m[2]) }
  if (/api[ _-]?key|requires\s+\w*_KEY|\b[A-Z][A-Z0-9]*_KEY\b/i.test(text))
    return { kind: 'not_checkable', reason: 'requires a secret/API key; HackProof never passes secrets into the sandbox' }
  if (/\b(users|customers|downloads|installs|revenue|signups)\b/i.test(text))
    return { kind: 'not_checkable', reason: 'claim about real-world usage cannot be reproduced by execution' }
  if (/%\s*faster than|\bfaster than\b|\bx faster\b/i.test(text))
    return { kind: 'not_checkable', reason: 'comparative performance claim without a reproducible benchmark command' }
  return null
}
