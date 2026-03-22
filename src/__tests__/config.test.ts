import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { loadConfig, DEFAULT_CONFIG } from '../config.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cost-gate-config-test-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('loadConfig', () => {
  it('returns defaults when no config file exists', () => {
    const result = loadConfig(tmpDir)
    expect(result.isOk()).toBe(true)
    expect(result.unwrap()).toEqual(DEFAULT_CONFIG)
  })

  it('loads budget from config file', () => {
    const config = { budget: 25.00 }
    fs.writeFileSync(path.join(tmpDir, '.cost-gate.json'), JSON.stringify(config), 'utf-8')

    const result = loadConfig(tmpDir)
    expect(result.isOk()).toBe(true)
    expect(result.unwrap().budget).toBe(25.00)
    // Other values should be defaults
    expect(result.unwrap().costPerToken).toBe(DEFAULT_CONFIG.costPerToken)
    expect(result.unwrap().warningThreshold).toBe(DEFAULT_CONFIG.warningThreshold)
  })

  it('loads all config values from file', () => {
    const config = { budget: 50.00, costPerToken: 0.00001, warningThreshold: 0.9 }
    fs.writeFileSync(path.join(tmpDir, '.cost-gate.json'), JSON.stringify(config), 'utf-8')

    const result = loadConfig(tmpDir)
    expect(result.isOk()).toBe(true)
    expect(result.unwrap()).toEqual(config)
  })

  it('returns error for invalid JSON', () => {
    fs.writeFileSync(path.join(tmpDir, '.cost-gate.json'), '{ broken json', 'utf-8')

    const result = loadConfig(tmpDir)
    expect(result.isErr()).toBe(true)
    expect(result.unwrapErr().code).toBe('PARSE_FAILED')
  })

  it('merges partial config with defaults', () => {
    const config = { warningThreshold: 0.5 }
    fs.writeFileSync(path.join(tmpDir, '.cost-gate.json'), JSON.stringify(config), 'utf-8')

    const result = loadConfig(tmpDir)
    expect(result.isOk()).toBe(true)
    const loaded = result.unwrap()
    expect(loaded.budget).toBe(DEFAULT_CONFIG.budget)
    expect(loaded.costPerToken).toBe(DEFAULT_CONFIG.costPerToken)
    expect(loaded.warningThreshold).toBe(0.5)
  })

  it('ignores non-numeric values and uses defaults', () => {
    const config = { budget: 'not a number', costPerToken: true }
    fs.writeFileSync(path.join(tmpDir, '.cost-gate.json'), JSON.stringify(config), 'utf-8')

    const result = loadConfig(tmpDir)
    expect(result.isOk()).toBe(true)
    const loaded = result.unwrap()
    expect(loaded.budget).toBe(DEFAULT_CONFIG.budget)
    expect(loaded.costPerToken).toBe(DEFAULT_CONFIG.costPerToken)
  })
})
