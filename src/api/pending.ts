import { updateCompleted } from './lastCompleted'
import type { MatchRecord, RegistrationStatus } from './contracts'
import { REGISTRATION_RETRY } from './RegistrationPolicy'
import { validMatch } from './contracts'
import { readMatches, STORAGE_KEYS, writeMatches } from './storage'
export interface PendingRegistration {
  match: MatchRecord
  status: RegistrationStatus
  error?: string
  durable: boolean
  initialStarted: boolean
  retriesPerformed: number
  nextAttemptAt: number
  exhausted: boolean
}
export const REGISTRATION_QUEUE_KEY = 'pirate-battle-registration-queue-v2'
const listeners = new Set<() => void>()
function readQueue(): PendingRegistration[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(REGISTRATION_QUEUE_KEY) ?? 'null')
    if (Array.isArray(raw)) return raw.filter((item): item is PendingRegistration =>
      !!item && validMatch(item.match) && Number.isInteger(item.retriesPerformed)
      && item.retriesPerformed >= 0 && item.retriesPerformed <= REGISTRATION_RETRY.delaysMs.length
      && Number.isFinite(item.nextAttemptAt) && typeof item.exhausted === 'boolean'
      && typeof item.initialStarted === 'boolean' && ['Pending', 'Saving', 'Failed'].includes(item.status))
      .map(item => ({ ...item, status: item.status === 'Saving' ? 'Pending' : item.status, durable: true }))
  } catch { /* Use legacy payloads when metadata is unavailable. */ }
  return readMatches(STORAGE_KEYS.pending).map(match => ({ match, status: 'Pending', durable: true,
    initialStarted: false, retriesPerformed: 0, nextAttemptAt: 0, exhausted: false }))
}
let pending = readQueue()
function publish() { listeners.forEach(listener => listener()) }
export const getPending = () => pending
export function subscribePending(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
export function reloadPending() {
  const loaded = readQueue()
  const session = pending.filter(item => !item.durable)
  const merged = [...loaded.filter(item => !session.some(other => other.match.matchId === item.match.matchId)), ...session]
  if (JSON.stringify(merged) !== JSON.stringify(pending)) { pending = merged; publish() }
}
function persistQueue() {
  // Commit the authoritative metadata last. A failed mirror write must not
  // erase an authoritative pending record or lose its consumed retry budget.
  writeMatches(STORAGE_KEYS.pending, pending.map(item => item.match))
  localStorage.setItem(REGISTRATION_QUEUE_KEY, JSON.stringify(pending))
}
export function updatePending(matchId: string, status: RegistrationStatus, error?: string,
  metadata: Partial<Pick<PendingRegistration, 'initialStarted' | 'retriesPerformed' | 'nextAttemptAt' | 'exhausted' | 'durable'>> = {}) {
  reloadPending()
  pending = pending.map(item => item.match.matchId === matchId ? { ...item, ...metadata, status, error } : item)
  let persisted = true
  try { persistQueue() } catch {
    persisted = false
    pending = pending.map(item => item.match.matchId === matchId ? { ...item, durable: false } : item)
  }
  updateCompleted(matchId, status, error)
  publish()
  return persisted
}
export function persistPending(match: MatchRecord) {
  const previous = pending
  pending = pending.map(item => item.match.matchId === match.matchId ? { ...item, durable: true } : item)
  try { persistQueue() } catch (error) { pending = previous; throw error }
}
export function enqueuePending(match: MatchRecord) {
  if (!validMatch(match)) throw new Error('Cannot queue an invalid match.')
  reloadPending()
  if (pending.some(item => item.match.matchId === match.matchId)) return
  pending = [...pending, { match, status: 'Pending', durable: false, initialStarted: false,
    retriesPerformed: 0, nextAttemptAt: 0, exhausted: false }]
  try { persistPending(match) }
  catch {
    pending = pending.map(item => item.match.matchId === match.matchId ? { ...item, durable: false,
      status: 'Failed', error: 'Unable to save pending match locally. Free storage and retry.' } : item)
  }
  publish()
}
export function completePending(matchId: string) {
  reloadPending()
  const previous = pending
  pending = pending.filter(item => item.match.matchId !== matchId)
  try { persistQueue() } catch (error) { pending = previous; throw error }
  updateCompleted(matchId, 'Saved')
  publish()
}
export function clearPending() {
  pending = []
  try {
    localStorage.removeItem(STORAGE_KEYS.pending)
    localStorage.removeItem(REGISTRATION_QUEUE_KEY)
    localStorage.removeItem('pirate-battle-registration-status-v1')
    localStorage.removeItem('pirate-battle-registration-permanent-errors-v1')
  } catch { /* Clear session metadata even when storage is unavailable. */ }
  publish()
}
