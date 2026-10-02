import { createSeed } from './SeededRandom'

let memory: number | null = null
function readSeed() { try { return sessionStorage.getItem(key) } catch { return memory === null ? null : String(memory) } }
function storeSeed(seed: number) { memory = seed; try { sessionStorage.setItem(key, String(seed)) } catch { /* Keep seed in memory. */ } }
const key = 'pirate-battle-seed'
export function currentMatchSeed(): number {
  const value = new URLSearchParams(window.location.search).get('seed') ?? readSeed()
  const seed = value !== null && /^\d+$/.test(value) && Number(value) <= 0xffffffff ? Number(value) : createSeed()
  storeSeed(seed)
  return seed
}
export function newMatchSeed(): number {
  const previous = currentMatchSeed()
  let seed = createSeed()
  if (seed === previous) seed = (seed + 1) >>> 0
  storeSeed(seed)
  return seed
}
