import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { loadCompleted } from './lastCompleted'
import type { MatchRecord } from './contracts'
import { API_TIMEOUT, registerMatch } from './client'
import { completePending, enqueuePending, getPending, persistPending, reloadPending, subscribePending, updatePending } from './pending'
import { queryKeys } from './queries'
import { REGISTRATION_RETRY } from './RegistrationPolicy'
export { REGISTRATION_RETRY } from './RegistrationPolicy'
const inFlight = new Map<string, Promise<void>>()
export function useRegistrations() {
  const client = useQueryClient()
  const { mutateAsync } = useMutation({
    mutationKey: ['registerMatch'], mutationFn: registerMatch,
    retry: false, networkMode: 'always',
  })
  const pending = useSyncExternalStore(subscribePending, getPending)
  const send = useCallback((match: MatchRecord, manual = false): Promise<void> => {
    const running = inFlight.get(match.matchId)
    if (running) return running
    if (!navigator.onLine) return Promise.resolve()
    const execute = async () => {
      reloadPending()
      const item = getPending().find(entry => entry.match.matchId === match.matchId)
      if (!item || !navigator.onLine) return
      if (!item.durable) {
        try { persistPending(item.match) } catch { return }
      }
      if (!manual && (item.exhausted || item.nextAttemptAt > Date.now())) return
      const retriesPerformed = item.retriesPerformed + (!manual && item.initialStarted ? 1 : 0)
      // Persist the consumed attempt before POST. Interrupted requests keep a
      // conservative recovery deadline, never a fresh automatic budget.
      const persisted = updatePending(match.matchId, 'Saving', undefined, {
        initialStarted: true, retriesPerformed,
        nextAttemptAt: Date.now() + API_TIMEOUT + (REGISTRATION_RETRY.delaysMs[retriesPerformed] ?? 0),
        exhausted: item.exhausted || (!manual && retriesPerformed >= REGISTRATION_RETRY.delaysMs.length),
      })
      if (!persisted) {
        updatePending(match.matchId, 'Failed', 'Unable to persist registration state. Free storage and retry.', {
          durable: false, initialStarted: item.initialStarted, retriesPerformed: item.retriesPerformed,
          nextAttemptAt: item.nextAttemptAt, exhausted: item.exhausted,
        })
        return
      }
      try {
        const response = await mutateAsync(item.match)
        completePending(match.matchId)
        await Promise.all([
          client.invalidateQueries({ queryKey: queryKeys.ranking(response.match.gameConfig) }),
          client.invalidateQueries({ queryKey: queryKeys.history(response.match.playerId) }),
        ])
      } catch (error) {
        const exhausted = item.exhausted || retriesPerformed >= REGISTRATION_RETRY.delaysMs.length
        updatePending(match.matchId, 'Failed', error instanceof Error ? error.message : 'Registration failed.', {
          exhausted, nextAttemptAt: exhausted ? 0 : Date.now() + REGISTRATION_RETRY.delaysMs[retriesPerformed],
        })
      }
    }
    // Serialize queue writes/POSTs across tabs, then re-read under the lock.
    // A single lock also protects metadata for different match IDs.
    const task = Promise.resolve().then(() => navigator.locks
      ? navigator.locks.request('pirate-battle-registration-queue', execute)
      : execute()).finally(() => { inFlight.delete(match.matchId) })
    inFlight.set(match.matchId, task)
    return task
  }, [client, mutateAsync])
  const retry = useCallback((match: MatchRecord) => { void send(match, true) }, [send])
  const submit = useCallback((match: MatchRecord) => { enqueuePending(match); void send(match) }, [send])
  useEffect(() => {
    // Recover legacy awaiting-name results and an interrupted completion handoff.
    const completed = loadCompleted()
    if (completed && completed.status !== 'Saved' && !getPending().some(item => item.match.matchId === completed.match.matchId)) {
      enqueuePending(completed.match)
    }
    let timer: number | undefined
    let disposed = false
    const recover = () => {
      window.clearTimeout(timer)
      if (disposed || !navigator.onLine) return
      const automatic = getPending().filter(item => item.durable && !item.exhausted && !inFlight.has(item.match.matchId))
      for (const item of automatic) {
        if (item.nextAttemptAt <= Date.now()) void send(item.match).finally(recover)
      }
      const future = automatic.filter(item => item.nextAttemptAt > Date.now())
      if (future.length) timer = window.setTimeout(recover, Math.max(1, Math.min(...future.map(item => item.nextAttemptAt - Date.now()))))
    }
    const unsubscribe = subscribePending(recover)
    const synchronize = () => { reloadPending(); recover() }
    window.addEventListener('online', synchronize)
    window.addEventListener('storage', synchronize)
    recover()
    return () => {
      disposed = true
      window.clearTimeout(timer)
      unsubscribe()
      window.removeEventListener('online', synchronize)
      window.removeEventListener('storage', synchronize)
    }
  }, [send])
  return { pending, submit, retry }
}
