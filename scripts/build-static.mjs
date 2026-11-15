// Build a read-only static site (no secrets): UI + saved real receipts + slides.
import { readdirSync, readFileSync, mkdirSync, copyFileSync, writeFileSync, cpSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const OUT = 'site'
rmSync(OUT, { recursive: true, force: true })
mkdirSync(join(OUT, 'data', 'receipts'), { recursive: true })
copyFileSync('public/index.html', join(OUT, 'index.html'))
copyFileSync('public/favicon.svg', join(OUT, 'favicon.svg'))

const list = []
for (const f of readdirSync('receipts').filter(f => f.endsWith('.json') && !f.startsWith('batch-'))) {
  const r = JSON.parse(readFileSync(join('receipts', f), 'utf8'))
  copyFileSync(join('receipts', f), join(OUT, 'data', 'receipts', f))
  list.push({ id: r.id, source: r.source, commit: r.commit, finishedAt: r.finishedAt, summary: r.summary, app: r.app })
}
list.sort((a, b) => String(b.finishedAt).localeCompare(String(a.finishedAt)))
writeFileSync(join(OUT, 'data', 'receipts.json'), JSON.stringify(list, null, 2))

mkdirSync(join(OUT, 'slides'), { recursive: true })
copyFileSync('docs/slides/hackproof.pdf', join(OUT, 'slides', 'hackproof.pdf'))
copyFileSync('docs/slides/hackproof.html', join(OUT, 'slides', 'index.html'))
cpSync('docs/slides/assets', join(OUT, 'slides', 'assets'), { recursive: true })
// AI-judge entry points on the public site: llms.txt with repo links made absolute
const GH = 'https://github.com/Masashi-Ono0611/daytona-hacksprint-tokyo-20261115/blob/main/'
const llms = readFileSync('llms.txt', 'utf8').replace(/\]\((?!https?:)([^)]+)\)/g, (_, p) => `](${GH}${p})`)
writeFileSync(join(OUT, 'llms.txt'), llms)
copyFileSync('docs/JUDGING.md', join(OUT, 'JUDGING.md'))

// Live verification on Vercel: one bundled function (no secrets in files; keys are Vercel env vars).
const { build } = await import('esbuild')
await build({
  entryPoints: ['api/verify.ts'], outfile: join(OUT, 'api', 'verify.mjs'),
  bundle: true, platform: 'node', format: 'esm', target: 'node20',
  external: ['@daytonaio/sdk'], logLevel: 'warning',
})
const sdkVersion = JSON.parse(readFileSync('node_modules/@daytonaio/sdk/package.json', 'utf8')).version
writeFileSync(join(OUT, 'package.json'), JSON.stringify({ private: true, type: 'module', dependencies: { '@daytonaio/sdk': sdkVersion } }, null, 2))
cpSync('demo-submissions', join(OUT, 'demo-submissions'), { recursive: true, filter: s => !s.includes('node_modules') })
writeFileSync(join(OUT, 'vercel.json'), JSON.stringify({
  functions: { 'api/verify.mjs': { maxDuration: 300, includeFiles: 'demo-submissions/**' } },
}, null, 2))
console.log(`static site: ${list.length} receipts + live function (sdk ${sdkVersion}) -> ${OUT}/`)
