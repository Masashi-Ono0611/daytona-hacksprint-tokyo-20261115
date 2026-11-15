import { existsSync, realpathSync, statSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Source } from './types.js'

// Shared input validation for the local server and the Vercel function.
// Only public GitHub repos and the bundled demo submissions are accepted.
// From source: src/verifier -> project root. When bundled into one file (Vercel function), that guess is wrong,
// so fall back to the working directory (Vercel runs functions with cwd = project root).
const fromUrl = resolve(fileURLToPath(new URL('../..', import.meta.url)))
export const PROJECT_ROOT = existsSync(resolve(fromUrl, 'demo-submissions')) ? fromUrl : process.cwd()
const DEMOS = resolve(PROJECT_ROOT, 'demo-submissions')

export function toSource(b: any): Source {
  if (typeof b?.localDir === 'string' && b.localDir) {
    // accept both "acme-notes" and "demo-submissions/acme-notes"; the containment check below still applies
    const p = b.localDir.startsWith('demo-submissions/') ? resolve(PROJECT_ROOT, b.localDir) : resolve(DEMOS, b.localDir)
    if (!existsSync(p)) throw new Error('localDir not found')
    const real = realpathSync(p), demos = realpathSync(DEMOS)
    if (!real.startsWith(demos + sep) || !statSync(real).isDirectory()) throw new Error('localDir must be inside demo-submissions/')
    return { kind: 'local', dir: real }
  }
  const url = String(b?.repoUrl ?? '')
  if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\.git)?\/?$/.test(url)) throw new Error('repoUrl must be https://github.com/<owner>/<repo>')
  const ref = b?.ref ? String(b.ref) : undefined
  const subdir = b?.subdir ? String(b.subdir) : undefined
  if (ref && !/^[\w./-]{1,100}$/.test(ref)) throw new Error('invalid ref')
  if (subdir && (!/^[\w./-]{1,200}$/.test(subdir) || subdir.includes('..') || subdir.startsWith('/'))) throw new Error('invalid subdir')
  return { kind: 'git', url: url.replace(/\/$/, ''), ref, subdir }
}
