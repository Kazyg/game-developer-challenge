export const MATCH_CONFIG = { minDuration: 60, maxDuration: 180, defaultDuration: 120 } as const

export function matchDuration(value: number): number {
  return Number.isFinite(value)
    ? Math.max(MATCH_CONFIG.minDuration, Math.min(MATCH_CONFIG.maxDuration, value))
    : MATCH_CONFIG.defaultDuration
}
