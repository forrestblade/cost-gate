import * as fs from 'node:fs'
import * as path from 'node:path'
import { fromThrowable, ok, err } from '@valencets/resultkit'
import type { Result } from '@valencets/resultkit'
import type { SessionState, Config, CostGateError } from './types.js'

const SESSION_FILENAME = '.cost-gate-session.json'

export function sessionPath (cwd: string): string {
  return path.join(cwd, SESSION_FILENAME)
}

export function createSession (config: Config): SessionState {
  return {
    started: new Date().toISOString(),
    totalTokens: 0,
    totalCost: 0,
    budget: config.budget,
    calls: 0,
  }
}

export function readSession (cwd: string): Result<SessionState, CostGateError> {
  const filePath = sessionPath(cwd)

  const safeReadFile = fromThrowable(
    (p: string) => fs.readFileSync(p, 'utf-8'),
    (): CostGateError => ({ code: 'IO_FAILED', message: `Could not read session file at ${filePath}` })
  )

  const readResult = safeReadFile(filePath)

  if (readResult.isErr()) {
    return err(readResult.error)
  }

  const safeParse = fromThrowable(
    (text: string) => JSON.parse(text) as SessionState,
    (): CostGateError => ({ code: 'PARSE_FAILED', message: `Invalid JSON in session file at ${filePath}` })
  )

  return safeParse(readResult.value)
}

export function writeSession (cwd: string, session: SessionState): Result<void, CostGateError> {
  const filePath = sessionPath(cwd)

  const safeStringify = fromThrowable(
    (val: SessionState) => JSON.stringify(val, null, 2),
    (): CostGateError => ({ code: 'PARSE_FAILED', message: 'Could not serialize session state' })
  )

  const stringifyResult = safeStringify(session)

  if (stringifyResult.isErr()) {
    return err(stringifyResult.error)
  }

  const safeWriteFile = fromThrowable(
    (p: string, data: string) => fs.writeFileSync(p, data, 'utf-8'),
    (): CostGateError => ({ code: 'IO_FAILED', message: `Could not write session file at ${filePath}` })
  )

  return safeWriteFile(filePath, stringifyResult.value)
}

export function updateSession (
  session: SessionState,
  additionalTokens: number,
  costPerToken: number
): SessionState {
  const newTokens = session.totalTokens + additionalTokens
  const newCost = newTokens * costPerToken
  return {
    started: session.started,
    totalTokens: newTokens,
    totalCost: newCost,
    budget: session.budget,
    calls: session.calls + 1,
  }
}

export function isBudgetExceeded (session: SessionState): boolean {
  return session.totalCost >= session.budget
}

export function isWarningThreshold (session: SessionState, threshold: number): boolean {
  return session.totalCost >= session.budget * threshold && session.totalCost < session.budget
}

export function resetSession (cwd: string): Result<void, CostGateError> {
  const filePath = sessionPath(cwd)

  const safeUnlink = fromThrowable(
    (p: string) => fs.unlinkSync(p),
    (): CostGateError => ({ code: 'IO_FAILED', message: `Could not delete session file at ${filePath}` })
  )

  const unlinkResult = safeUnlink(filePath)

  if (unlinkResult.isErr()) {
    // File might not exist — that's fine
    return ok(undefined)
  }

  return ok(undefined)
}

export function getOrCreateSession (cwd: string, config: Config): Result<SessionState, CostGateError> {
  const existing = readSession(cwd)

  if (existing.isOk()) {
    return ok(existing.value)
  }

  const fresh = createSession(config)
  const writeResult = writeSession(cwd, fresh)

  if (writeResult.isErr()) {
    return err(writeResult.error)
  }

  return ok(fresh)
}
