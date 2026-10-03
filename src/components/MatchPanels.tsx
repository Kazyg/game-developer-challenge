import type { ReactNode } from 'react'
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
function StateMessage({ status }: { status: string; message?: string }) {
  if (status === 'error') return null
  return <p role="status">{status === 'loading' ? 'Loading...' : 'No records yet.'}</p>
}
function QueryFeedback({ data, onRetry }: { data: DataPage<unknown>; onRetry?: () => void }) {
  return <>
    {data.refreshing && <p role="status">Refreshing…</p>}
    {(data.status === 'error' || data.message) && <div role="alert">
      <p>{data.message ?? "Couldn't load records."}</p>
      <button type="button" className="secondary" disabled={data.refreshing} onClick={onRetry}>Retry</button>
    </div>}
  </>
}
function PanelFrame({ data, page, onPageChange, onRetry, children }: Props<unknown> & { children: ReactNode }) {
  return <>
    {data.status !== 'data' ? <StateMessage status={data.status} />
      : data.items.length === 0 ? <StateMessage status="empty" /> : children}
    <QueryFeedback data={data} onRetry={onRetry} />
    <Pagination page={page} next={data.status === 'data' && data.hasNext} onPageChange={onPageChange} />
  </>
}
export function RankingPanel({ data, page, onPageChange, onRetry }: Props<RankingEntry>) {
  return <PanelFrame data={data} page={page} onPageChange={onPageChange} onRetry={onRetry}>
    {data.status === 'data' &&
      <table><caption className="sr-only">Ranking</caption><thead><tr><th scope="col">Rank</th><th scope="col">Player</th><th scope="col">Score</th><th scope="col">Duration</th></tr></thead>
        <tbody>{data.items.map(row => <tr key={row.id}><td>{row.rank}</td><th scope="row">{row.playerName}</th><td>{row.score}</td><td>{row.duration === undefined ? '—' : `${Math.floor(row.duration)}s`}</td></tr>)}</tbody></table>}
  </PanelFrame>
}
export function HistoryPanel({ data, page, onPageChange, onRetry }: Props<HistoryEntry>) {
  return <PanelFrame data={data} page={page} onPageChange={onPageChange} onRetry={onRetry}>
    {data.status === 'data' &&
      <table><caption className="sr-only">Match History</caption><thead><tr><th scope="col">Date</th><th scope="col">Score</th><th scope="col">Duration</th><th scope="col">End Reason</th></tr></thead>
        <tbody>{data.items.map(row => <tr key={row.id}><th scope="row"><time dateTime={row.date}>{new Date(row.date).toLocaleDateString('en-US')}</time></th><td>{row.score}</td><td>{Math.floor(row.duration)}s</td><td>{endReasonLabel(row.reason)}</td></tr>)}</tbody></table>}
  </PanelFrame>
}
