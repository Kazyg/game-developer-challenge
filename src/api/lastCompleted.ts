import type { MatchRecord } from './contracts'
import { validMatch } from './contracts'
import type { RegistrationStatus } from '../components/MatchData'
export interface CompletedMatch { match: MatchRecord; seed: number; status: RegistrationStatus; error?: string }
const key = 'pirate-battle-lastCompletedMatch-v1'
let memory: CompletedMatch | null = null
let firstRead = true
export function loadCompleted(): CompletedMatch | null {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null') as CompletedMatch | null
    if (value && validMatch(value.match) && Number.isInteger(value.seed) && ['Pending', 'Saving', 'Saved', 'Failed'].includes(value.status)) {
      memory = { ...value, error: typeof value.error === 'string' ? value.error : undefined }
      // An interrupted request is retryable; no request remains in flight after refresh.
      if (firstRead && memory.status === 'Saving') saveCompleted({ ...memory, status: 'Pending' })
    }
  } catch { /* Keep the in-memory result when storage is inaccessible. */ }
  firstRead = false
  return memory
}
export function saveCompleted(value: CompletedMatch) {
  memory = value
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* The result remains available in this session. */ }
}
export function updateCompleted(id: string, status: RegistrationStatus, error?: string) {
  const value = loadCompleted()
  if (value?.match.matchId === id) saveCompleted({ ...value, status, error })
}
