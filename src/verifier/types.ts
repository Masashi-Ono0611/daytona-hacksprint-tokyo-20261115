export type Check =
  | { kind: 'test_count'; cmd: string; expectPassed: number }
  | { kind: 'http_status'; path: string; expect: number }
  | { kind: 'latency'; path: string; samples: number; p50MaxMs: number }
  | { kind: 'command_exit'; cmd: string }
  | { kind: 'not_checkable'; reason: string }

export type Claim = { id: string; text: string; check: Check }

export type PlannerInfo = { kind: 'nosana-llm' | 'heuristic'; model?: string; host?: string; fallbackReason?: string }

export type Plan = {
  planner: PlannerInfo
  install: string[]
  start?: { cmd: string; healthPath: string }
  claims: Claim[]
}

export type Source =
  | { kind: 'git'; url: string; ref?: string; subdir?: string }
  | { kind: 'local'; dir: string }

export type Verdict = 'verified' | 'refuted' | 'inconclusive' | 'not_checkable'

export type Step = { name: string; cmd: string; exitCode: number; ms: number; outputTail: string }

export type ClaimResult = Claim & {
  verdict: Verdict
  reason: string
  evidence?: { cmd: string; exitCode?: number; observed?: string; outputTail?: string }
}

export type Receipt = {
  id: string
  source: Source
  commit: string
  startedAt: string
  finishedAt: string
  totalMs: number
  sandbox: { id: string; createMs: number }
  planner: PlannerInfo
  steps: Step[]
  app: { status: 'runs' | 'fails' | 'not_started'; port?: number; reason?: string }
  claims: ClaimResult[]
  summary: { verified: number; refuted: number; inconclusive: number; not_checkable: number }
  sha256: string
}

export type VerifyEvent = { t: number; msg: string }
