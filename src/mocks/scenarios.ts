export const scenarios = ['success', 'empty', 'multiple-pages', 'slow', 'variable-latency', 'out-of-order', 'timeout', 'network-error', 'http-400', 'http-500', 'ranking-failure', 'history-failure', 'timeout-after-register', 'unavailable-on-match-end'] as const
export type NetworkScenario = typeof scenarios[number]
export interface ScenarioConfig { scenario: NetworkScenario; latency: number; seed: number }
const key = 'pirate-battle-network-v1'
function load(): ScenarioConfig {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null') as ScenarioConfig | null
    if (value && scenarios.includes(value.scenario) && Number.isFinite(value.latency) && value.latency >= 0 && Number.isInteger(value.seed)) return value
  } catch { /* Default to a usable network. */ }
  return { scenario: 'success', latency: 80, seed: 42 }
}
let config = load()
let sequence = 0
const listeners = new Set<() => void>()
export const getScenario = () => config
export function subscribeScenario(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } }
export function setScenario(scenario: NetworkScenario, options: Partial<Omit<ScenarioConfig, 'scenario'>> = {}) {
  config = { ...config, ...options, scenario }; sequence = 0
  try { localStorage.setItem(key, JSON.stringify(config)) } catch { /* Scenario still works in memory. */ }
  listeners.forEach(listener => listener())
}
export function nextScenario() {
  const index = sequence++
  const noise = ((Math.imul(index + config.seed, 1664525) + 1013904223) >>> 0) % 1000
  return { ...config, delay: config.scenario === 'slow' ? Math.max(config.latency, 1200)
    : config.scenario === 'variable-latency' ? config.latency + noise
    : config.scenario === 'out-of-order' ? (index % 2 === 0 ? 1200 : 30) : config.latency }
}
