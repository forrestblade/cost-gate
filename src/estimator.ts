import { fromThrowable, ok } from '@valencets/resultkit'
import type { Result } from '@valencets/resultkit'
import type { CostGateError } from './types.js'

export function estimateTokens (payload: unknown): Result<number, CostGateError> {
  const safeStringify = fromThrowable(
    (val: unknown) => JSON.stringify(val),
    (): CostGateError => ({ code: 'PARSE_FAILED', message: 'Could not stringify payload for token estimation' })
  )

  const stringifyResult = safeStringify(payload)

  if (stringifyResult.isErr()) {
    return ok(0)
  }

  const str = stringifyResult.value
  if (str === undefined || str === null) {
    return ok(0)
  }

  const charCount = str.length
  return ok(Math.ceil(charCount / 4))
}

export function estimateCost (tokens: number, costPerToken: number): number {
  return tokens * costPerToken
}
