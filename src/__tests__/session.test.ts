import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import {
  createSession,
  readSession,
  writeSession,
  updateSession,
  isBudgetExceeded,
  isWarningThreshold,
  resetSession,
  getOrCreateSession,
  sessionPath,
} from '../session.js'
import type { Config, SessionState } from '../types.js'

const TEST_CONFIG: Config = {
  budget: 10.00,
  costPerToken: 0.000003,
  warningThreshold: 0.8,
}

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cost-gate-test-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('createSession', () => {
  it('creates a fresh session with zero counters', () => {
    const session = createSession(TEST_CONFIG)
    expect(session.totalTokens).toBe(0)
    expect(session.totalCost).toBe(0)
    expect(session.budget).toBe(10.00)
    expect(session.calls).toBe(0)
    expect(session.started).toBeTruthy()
  })

  it('uses budget from config', () => {
    const config: Config = { ...TEST_CONFIG, budget: 25.00 }
    const session = createSession(config)
    expect(session.budget).toBe(25.00)
  })
})

describe('readSession / writeSession', () => {
  it('round-trips a session through the filesystem', () => {
    const session = createSession(TEST_CONFIG)
    const writeResult = writeSession(tmpDir, session)
    expect(writeResult.isOk()).toBe(true)

    const readResult = readSession(tmpDir)
    expect(readResult.isOk()).toBe(true)
    expect(readResult.unwrap()).toEqual(session)
  })

  it('returns an error when reading from a nonexistent path', () => {
    const result = readSession('/tmp/nonexistent-cost-gate-dir-xyz')
    expect(result.isErr()).toBe(true)
    expect(result.unwrapErr().code).toBe('IO_FAILED')
  })

  it('returns an error for corrupt JSON', () => {
    fs.writeFileSync(sessionPath(tmpDir), 'not valid json', 'utf-8')
    const result = readSession(tmpDir)
    expect(result.isErr()).toBe(true)
    expect(result.unwrapErr().code).toBe('PARSE_FAILED')
  })
})

describe('updateSession', () => {
  it('increments tokens and recalculates cost', () => {
    const session = createSession(TEST_CONFIG)
    const updated = updateSession(session, 1000, TEST_CONFIG.costPerToken)
    expect(updated.totalTokens).toBe(1000)
    expect(updated.totalCost).toBeCloseTo(0.003)
    expect(updated.calls).toBe(1)
  })

  it('accumulates across multiple updates', () => {
    const s0 = createSession(TEST_CONFIG)
    const s1 = updateSession(s0, 500, TEST_CONFIG.costPerToken)
    const s2 = updateSession(s1, 500, TEST_CONFIG.costPerToken)
    expect(s2.totalTokens).toBe(1000)
    expect(s2.totalCost).toBeCloseTo(0.003)
    expect(s2.calls).toBe(2)
  })

  it('preserves started timestamp', () => {
    const session = createSession(TEST_CONFIG)
    const updated = updateSession(session, 100, TEST_CONFIG.costPerToken)
    expect(updated.started).toBe(session.started)
  })
})

describe('isBudgetExceeded', () => {
  it('returns false when under budget', () => {
    const session: SessionState = {
      started: new Date().toISOString(),
      totalTokens: 100,
      totalCost: 0.001,
      budget: 10.00,
      calls: 1,
    }
    expect(isBudgetExceeded(session)).toBe(false)
  })

  it('returns true when at budget', () => {
    const session: SessionState = {
      started: new Date().toISOString(),
      totalTokens: 3_333_334,
      totalCost: 10.00,
      budget: 10.00,
      calls: 100,
    }
    expect(isBudgetExceeded(session)).toBe(true)
  })

  it('returns true when over budget', () => {
    const session: SessionState = {
      started: new Date().toISOString(),
      totalTokens: 5_000_000,
      totalCost: 15.00,
      budget: 10.00,
      calls: 200,
    }
    expect(isBudgetExceeded(session)).toBe(true)
  })
})

describe('isWarningThreshold', () => {
  it('returns false when under threshold', () => {
    const session: SessionState = {
      started: new Date().toISOString(),
      totalTokens: 100,
      totalCost: 1.00,
      budget: 10.00,
      calls: 1,
    }
    expect(isWarningThreshold(session, 0.8)).toBe(false)
  })

  it('returns true when at threshold but under budget', () => {
    const session: SessionState = {
      started: new Date().toISOString(),
      totalTokens: 2_666_667,
      totalCost: 8.00,
      budget: 10.00,
      calls: 50,
    }
    expect(isWarningThreshold(session, 0.8)).toBe(true)
  })

  it('returns false when over budget (exceeded, not warning)', () => {
    const session: SessionState = {
      started: new Date().toISOString(),
      totalTokens: 5_000_000,
      totalCost: 15.00,
      budget: 10.00,
      calls: 200,
    }
    expect(isWarningThreshold(session, 0.8)).toBe(false)
  })
})

describe('resetSession', () => {
  it('removes the session file', () => {
    const session = createSession(TEST_CONFIG)
    writeSession(tmpDir, session)
    expect(fs.existsSync(sessionPath(tmpDir))).toBe(true)

    const result = resetSession(tmpDir)
    expect(result.isOk()).toBe(true)
    expect(fs.existsSync(sessionPath(tmpDir))).toBe(false)
  })

  it('succeeds even if no session file exists', () => {
    const result = resetSession(tmpDir)
    expect(result.isOk()).toBe(true)
  })
})

describe('getOrCreateSession', () => {
  it('creates a new session if none exists', () => {
    const result = getOrCreateSession(tmpDir, TEST_CONFIG)
    expect(result.isOk()).toBe(true)
    expect(result.unwrap().totalTokens).toBe(0)
    expect(fs.existsSync(sessionPath(tmpDir))).toBe(true)
  })

  it('returns existing session if one exists', () => {
    const session: SessionState = {
      started: '2026-01-01T00:00:00.000Z',
      totalTokens: 5000,
      totalCost: 0.015,
      budget: 10.00,
      calls: 10,
    }
    writeSession(tmpDir, session)

    const result = getOrCreateSession(tmpDir, TEST_CONFIG)
    expect(result.isOk()).toBe(true)
    expect(result.unwrap().totalTokens).toBe(5000)
    expect(result.unwrap().started).toBe('2026-01-01T00:00:00.000Z')
  })
})
