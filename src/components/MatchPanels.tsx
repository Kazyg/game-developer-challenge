import type { DataPage, HistoryEntry, RankingEntry } from './MatchData'
import { endReasonLabel } from './MatchData'

interface Props<T> { data: DataPage<T>; page: number; onPageChange: (page: number) => void; onRetry?: () => void }
function Pagination({ page, next, onPageChange }: { page: number; next: boolean; onPageChange: (page: number) => void }) {
  return <nav className="pagination" aria-label="Pagination">
    <button type="button" className="secondary" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Previous</button>
    <span aria-live="polite">Page {page}</span>
    <button type="button" className="secondary" disabled={!next} onClick={() => onPageChange(page + 1)}>Next</button>
  </nav>
}
function StateMessage({ status, message }: { status: string; message?: string }) {
  return <p role={status === 'error' ? 'alert' : 'status'}>{message ?? (status === 'loading' ? 'Loading…' : status === 'error' ? 'Unable to load records. Please try again later.' : 'No records yet.')}</p>
}
function QueryFeedback({ data, onRetry }: { data: DataPage<unknown>; onRetry?: () => void }) {
  return <>
    {data.status === 'data' && data.refreshing && <p role="status">Refreshing…</p>}
    {data.status === 'data' && data.message && <p role="alert">{data.message}</p>}
    {onRetry && (data.status === 'error' || (data.status === 'data' && data.message)) && <button type="button" onClick={onRetry}>Retry</button>}
  </>
}
export function RankingPanel({ data, page, onPageChange, onRetry }: Props<RankingEntry>) {
  return <>
    {data.status !== 'data' ? <StateMessage status={data.status} message={data.message} /> : data.items.length === 0 ? <StateMessage status="empty" /> :
      <table><caption className="sr-only">Ranking</caption><thead><tr><th scope="col">Rank</th><th scope="col">Player</th><th scope="col">Score</th><th scope="col">Duration</th></tr></thead>
        <tbody>{data.items.map(row => <tr key={row.id}><td>{row.rank}</td><th scope="row">{row.playerName}</th><td>{row.score}</td><td>{row.duration === undefined ? '—' : `${Math.floor(row.duration)}s`}</td></tr>)}</tbody></table>}
    <QueryFeedback data={data} onRetry={onRetry} />
    <Pagination page={page} next={data.status === 'data' && data.hasNext} onPageChange={onPageChange} />
  </>
}
export function HistoryPanel({ data, page, onPageChange, onRetry }: Props<HistoryEntry>) {
  return <>
    {data.status !== 'data' ? <StateMessage status={data.status} message={data.message} /> : data.items.length === 0 ? <StateMessage status="empty" /> :
      <table><caption className="sr-only">Match History</caption><thead><tr><th scope="col">Date</th><th scope="col">Score</th><th scope="col">Duration</th><th scope="col">End Reason</th></tr></thead>
        <tbody>{data.items.map(row => <tr key={row.id}><th scope="row"><time dateTime={row.date}>{new Date(row.date).toLocaleDateString('en-US')}</time></th><td>{row.score}</td><td>{Math.floor(row.duration)}s</td><td>{endReasonLabel(row.reason)}</td></tr>)}</tbody></table>}
    <QueryFeedback data={data} onRetry={onRetry} />
    <Pagination page={page} next={data.status === 'data' && data.hasNext} onPageChange={onPageChange} />
  </>
}
