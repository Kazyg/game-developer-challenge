import { loadCompleted, updateCompleted } from './lastCompleted'
import type { MatchRecord } from './contracts'
import type { RegistrationStatus } from '../components/MatchData'
import { readMatches, STORAGE_KEYS, writeMatches } from './storage'

export interface PendingRegistration { match: MatchRecord; status: RegistrationStatus; error?: string; durable: boolean }
let pending: PendingRegistration[] = readMatches(STORAGE_KEYS.pending).map(match => ({ match, status: loadCompleted()?.match.matchId === match.matchId ? loadCompleted()!.status : 'Pending', error: loadCompleted()?.match.matchId === match.matchId ? loadCompleted()?.error : undefined, durable: true }))
const listeners = new Set<() => void>()
function publish() { listeners.forEach(listener => listener()) }
export const getPending = () => pending
export function subscribePending(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } }
export function updatePending(matchId: string, status: RegistrationStatus, error?: string) {
  updateCompleted(matchId, status, error)
  pending = pending.map(item => item.match.matchId === matchId ? { ...item, status, error } : item)
  publish()
}
export function persistPending(match: MatchRecord) {
  const matches = readMatches(STORAGE_KEYS.pending)
  if (!matches.some(item => item.matchId === match.matchId)) writeMatches(STORAGE_KEYS.pending, [...matches, match])
  pending = pending.map(item => item.match.matchId === match.matchId ? { ...item, durable: true } : item)
}
export function enqueuePending(match: MatchRecord) {
  if (pending.some(item => item.match.matchId === match.matchId)) return
  pending = [...pending, { match, status: 'Pending', durable: false }]
  try { persistPending(match) }
  catch { pending = pending.map(entry => entry.match.matchId === match.matchId ? { ...entry, status: 'Failed', error: 'Unable to save pending match locally. Free storage and retry.' } : entry) }
  publish()
}
export function completePending(matchId: string) {
  updateCompleted(matchId, 'Saved')
  writeMatches(STORAGE_KEYS.pending, readMatches(STORAGE_KEYS.pending).filter(match => match.matchId !== matchId))
  pending = pending.filter(item => item.match.matchId !== matchId)
  publish()
}
export function clearPending() {
  try { localStorage.removeItem(STORAGE_KEYS.pending) } catch { /* Clear the session queue regardless. */ }
  pending = []
  publish()
}
