import type { MatchRecord } from './contracts'
import { validMatch } from './contracts'
import type { RegistrationStatus } from './contracts'
export interface CompletedMatch { match: MatchRecord; seed: number; status: RegistrationStatus; error?: string; awaitingName?: boolean }
const key = 'pirate-battle-lastCompletedMatch-v1'
let memory: CompletedMatch | null = null
let firstRead = true
let durable = true
const listeners = new Set<() => void>()
const publish = () => listeners.forEach(listener => listener())
export const getCompleted = () => memory
export function subscribeCompleted(listener: () => void) {
  listeners.add(listener)
  const synchronize = (event: StorageEvent) => { if (event.key === key || event.key === null) loadCompleted() }
  window.addEventListener('storage', synchronize)
  return () => { listeners.delete(listener); window.removeEventListener('storage', synchronize) }
}
export function loadCompleted(): CompletedMatch | null {
  if (!durable) return memory
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null') as CompletedMatch | null
    if (value && validMatch(value.match) && Number.isInteger(value.seed) && ['Pending', 'Saving', 'Saved', 'Failed'].includes(value.status)) {
      const next = { ...value, error: typeof value.error === 'string' ? value.error : undefined }
      if (JSON.stringify(next) !== JSON.stringify(memory)) { memory = next; publish() }
      // An interrupted request is retryable; no request remains in flight after refresh.
      if (firstRead && memory?.status === 'Saving' && memory.match) {
  saveCompleted({
    ...memory,
    match: memory.match,
    status: 'Pending',
  })
}
    } else if (memory) { memory = null; publish() }
  } catch { /* Keep the in-memory result when storage is inaccessible. */ }
  firstRead = false
  return memory
}
export function saveCompleted(value: CompletedMatch) {
  memory = value
  try { localStorage.setItem(key, JSON.stringify(value)); durable = true } catch { durable = false }
  publish()
}
export function clearCompleted() {
  localStorage.removeItem(key)
  memory = null
  durable = true
  publish()
}
export function updateCompleted(id: string, status: RegistrationStatus, error?: string) {
  const value = loadCompleted()
  if (value?.match.matchId === id) saveCompleted({ ...value, status, error })
}

loadCompleted()
