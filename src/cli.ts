import { fromThrowable } from '@valencets/resultkit'
import { loadConfig } from './config.js'
import {
  getOrCreateSession,
  updateSession,
  writeSession,
  isBudgetExceeded,
  isWarningThreshold,
  resetSession,
  readSession,
} from './session.js'
import { estimateTokens } from './estimator.js'

function readStdin (): Promise<string> {
  return new Promise((resolve) => {
    let data = ''
    process.stdin.setEncoding('utf-8')
    process.stdin.on('data', (chunk: string) => {
      data += chunk
    })
    process.stdin.on('end', () => {
      resolve(data)
    })
  })
}

function hasStdin (): boolean {
  return !process.stdin.isTTY
}

function formatDenyOutput (session: { readonly totalCost: number; readonly budget: number }): string {
  return JSON.stringify({
    decision: 'deny',
    reason: `Budget exceeded: $${session.totalCost.toFixed(4)} of $${session.budget.toFixed(2)} used. Run "cost-gate reset" to clear.`,
  })
}

function formatWarningOutput (session: { readonly totalCost: number; readonly budget: number }): string {
  const pct = ((session.totalCost / session.budget) * 100).toFixed(1)
  return JSON.stringify({
    decision: 'allow',
    reason: `[COST-GATE] Warning: ${pct}% of budget used ($${session.totalCost.toFixed(4)} / $${session.budget.toFixed(2)})`,
  })
}

function formatPostToolOutput (): string {
  return JSON.stringify({})
}

function handlePreToolUse (payload: Record<string, unknown>, cwd: string): void {
  const configResult = loadConfig(cwd)
  if (configResult.isErr()) {
    // Can't load config — allow the call
    process.exit(0)
    return
  }
  const config = configResult.value

  const sessionResult = getOrCreateSession(cwd, config)
  if (sessionResult.isErr()) {
    // Can't read session — allow the call
    process.exit(0)
    return
  }

  const toolInput = payload['tool_input'] ?? {}
  const tokenResult = estimateTokens(toolInput)
  const estimatedTokens = tokenResult.isOk() ? tokenResult.value : 0

  const updated = updateSession(sessionResult.value, estimatedTokens, config.costPerToken)
  writeSession(cwd, updated)

  if (isBudgetExceeded(updated)) {
    process.stdout.write(formatDenyOutput(updated) + '\n')
    process.exit(2)
    return
  }

  if (isWarningThreshold(updated, config.warningThreshold)) {
    process.stdout.write(formatWarningOutput(updated) + '\n')
    process.exit(0)
    return
  }

  process.exit(0)
}

function handlePostToolUse (payload: Record<string, unknown>, cwd: string): void {
  const configResult = loadConfig(cwd)
  if (configResult.isErr()) {
    process.exit(0)
    return
  }
  const config = configResult.value

  const sessionResult = getOrCreateSession(cwd, config)
  if (sessionResult.isErr()) {
    process.exit(0)
    return
  }

  const toolResponse = payload['tool_response'] ?? ''
  const tokenResult = estimateTokens(toolResponse)
  const estimatedTokens = tokenResult.isOk() ? tokenResult.value : 0

  const updated = updateSession(sessionResult.value, estimatedTokens, config.costPerToken)
  writeSession(cwd, updated)

  process.stdout.write(formatPostToolOutput() + '\n')
  process.exit(0)
}

function handleStatus (cwd: string): void {
  const sessionResult = readSession(cwd)

  if (sessionResult.isErr()) {
    process.stdout.write('No active session.\n')
    process.exit(0)
    return
  }

  const session = sessionResult.value
  const pct = session.budget > 0 ? ((session.totalCost / session.budget) * 100).toFixed(1) : '0.0'

  process.stdout.write([
    `Session started: ${session.started}`,
    `Total tokens:    ${session.totalTokens.toLocaleString()}`,
    `Total cost:      $${session.totalCost.toFixed(4)}`,
    `Budget:          $${session.budget.toFixed(2)}`,
    `Used:            ${pct}%`,
    `Tool calls:      ${session.calls}`,
    '',
  ].join('\n'))

  process.exit(0)
}

function handleReset (cwd: string): void {
  resetSession(cwd)
  process.stdout.write('Session reset.\n')
  process.exit(0)
}

function detectHookEvent (payload: Record<string, unknown>): string | undefined {
  const hookEvent = payload['hook_event_name']
  if (typeof hookEvent === 'string') {
    return hookEvent
  }
  // Also check for tool_name (PreToolUse) or tool_response (PostToolUse)
  if ('tool_name' in payload && 'tool_input' in payload) {
    return 'PreToolUse'
  }
  if ('tool_response' in payload) {
    return 'PostToolUse'
  }
  return undefined
}

const subcommands: Record<string, (cwd: string) => void> = {
  status: handleStatus,
  reset: handleReset,
}

export async function run (): Promise<void> {
  const cwd = process.cwd()

  if (hasStdin()) {
    // Hook mode — read from stdin
    const raw = await readStdin()

    if (raw.trim().length === 0) {
      process.exit(0)
      return
    }

    const safeParse = fromThrowable(
      (text: string) => JSON.parse(text) as Record<string, unknown>,
      () => null
    )

    const parseResult = safeParse(raw)
    if (parseResult.isErr() || parseResult.value === null) {
      process.exit(0)
      return
    }

    const payload = parseResult.value
    const hookEvent = detectHookEvent(payload)

    const hookHandlers: Record<string, (p: Record<string, unknown>, d: string) => void> = {
      PreToolUse: handlePreToolUse,
      PostToolUse: handlePostToolUse,
    }

    const handler = hookEvent !== undefined ? hookHandlers[hookEvent] : undefined

    if (handler !== undefined) {
      handler(payload, cwd)
    } else {
      process.exit(0)
    }

    return
  }

  // CLI mode
  const subcommand = process.argv[2]

  if (subcommand === undefined) {
    process.stdout.write('Usage: cost-gate <status|reset>\n')
    process.exit(0)
    return
  }

  const handler = subcommands[subcommand]

  if (handler !== undefined) {
    handler(cwd)
  } else {
    process.stderr.write(`Unknown command: ${subcommand}\n`)
    process.exit(1)
  }
}
