import { useCallback, useSyncExternalStore } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { MatchRecord } from './contracts'
import { registerMatch } from './client'
import { completePending, enqueuePending, getPending, persistPending, subscribePending, updatePending } from './pending'
import { queryKeys } from './queries'

// One in-flight POST per ID, even if several retry actions happen in the same tick.
const inFlight = new Map<string, Promise<MatchRecord>>()
async function send(match: MatchRecord) {
  const running = inFlight.get(match.matchId)
  if (running) return running
  const task = (async () => {
    persistPending(match)
    updatePending(match.matchId, 'Saving')
    return (await registerMatch(match)).match
  })()
  inFlight.set(match.matchId, task)
  try { return await task } finally { inFlight.delete(match.matchId) }
}
export function useRegistrations() {
  const client = useQueryClient()
  const pending = useSyncExternalStore(subscribePending, getPending)
  const { mutate } = useMutation({
    mutationKey: ['register-match'], mutationFn: send,
    onSuccess: async match => {
      try { completePending(match.matchId) }
      catch { updatePending(match.matchId, 'Failed', 'Match saved; local pending cleanup failed. Retry safely.') }
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.ranking(match.gameConfig) }),
        client.invalidateQueries({ queryKey: queryKeys.history(match.playerId) }),
      ])
    },
    onError: (error, match) => updatePending(match.matchId, 'Failed', error.message),
  })
  const retry = useCallback((match: MatchRecord) => {
    if (inFlight.has(match.matchId)) return
    mutate(match)
  }, [mutate])
  const submit = useCallback((match: MatchRecord) => {
    enqueuePending(match)
    if (getPending().find(item => item.match.matchId === match.matchId)?.durable) retry(match)
  }, [retry])
  return { pending, submit, retry }
}
