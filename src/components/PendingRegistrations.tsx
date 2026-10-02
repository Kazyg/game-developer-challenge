import type { MatchRecord } from '../api/contracts'
import type { PendingRegistration } from '../api/pending'

export default function PendingRegistrations({ pending, onRetry }: { pending: PendingRegistration[]; onRetry: (match: MatchRecord) => void }) {
  if (!pending.length) return null
  return <aside className="pending-registrations" aria-label="Pending registrations">
    <h2>Pending Registrations ({pending.length})</h2>
    {pending.map(({ match, status, error }) => <div key={match.matchId}>
      <p>{new Date(match.date).toLocaleString()} · Score: {match.score} · <span role="status">{status}</span></p>
      {error && <p role="alert">{error}</p>}
      <button type="button" disabled={status === 'Saving'} onClick={() => onRetry(match)}>Retry Registration</button>
    </div>)}
  </aside>
}
