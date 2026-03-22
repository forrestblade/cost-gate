export interface SessionState {
  readonly started: string
  readonly totalTokens: number
  readonly totalCost: number
  readonly budget: number
  readonly calls: number
}

export interface Config {
  readonly budget: number
  readonly costPerToken: number
  readonly warningThreshold: number
}

export const CostGateErrorCode = {
  IO_FAILED: 'IO_FAILED',
  PARSE_FAILED: 'PARSE_FAILED',
  BUDGET_EXCEEDED: 'BUDGET_EXCEEDED',
} as const

export type CostGateErrorCode = typeof CostGateErrorCode[keyof typeof CostGateErrorCode]

export interface CostGateError {
  readonly code: CostGateErrorCode
  readonly message: string
}
