import * as fs from 'node:fs'
import * as path from 'node:path'
import { fromThrowable, ok, err } from '@valencets/resultkit'
import type { Result } from '@valencets/resultkit'
import type { Config, CostGateError } from './types.js'

const DEFAULT_CONFIG: Config = {
  budget: 10.00,
  costPerToken: 0.000003,
  warningThreshold: 0.8,
}

const CONFIG_FILENAME = '.cost-gate.json'

export function loadConfig (cwd: string): Result<Config, CostGateError> {
  const configPath = path.join(cwd, CONFIG_FILENAME)

  const safeReadFile = fromThrowable(
    (p: string) => fs.readFileSync(p, 'utf-8'),
    (): CostGateError => ({ code: 'IO_FAILED', message: `Could not read ${configPath}` })
  )

  const readResult = safeReadFile(configPath)

  if (readResult.isErr()) {
    // No config file — use defaults
    return ok(DEFAULT_CONFIG)
  }

  const safeParse = fromThrowable(
    (text: string) => JSON.parse(text) as Partial<Config>,
    (): CostGateError => ({ code: 'PARSE_FAILED', message: `Invalid JSON in ${configPath}` })
  )

  const parseResult = safeParse(readResult.value)

  if (parseResult.isErr()) {
    return err(parseResult.error)
  }

  const parsed = parseResult.value

  return ok({
    budget: typeof parsed.budget === 'number' ? parsed.budget : DEFAULT_CONFIG.budget,
    costPerToken: typeof parsed.costPerToken === 'number' ? parsed.costPerToken : DEFAULT_CONFIG.costPerToken,
    warningThreshold: typeof parsed.warningThreshold === 'number' ? parsed.warningThreshold : DEFAULT_CONFIG.warningThreshold,
  })
}

export { DEFAULT_CONFIG }
