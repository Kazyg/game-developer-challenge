import { useId, useState } from 'react'
import ScreenLayout from '../../components/ScreenLayout'
import { HistoryPanel, RankingPanel } from '../../components/MatchPanels'
import type { DataPage, HistoryEntry, RankingEntry } from '../../components/MatchData'
import titleUrl from '../../../assets/png/retina/ui/menu/title_pirate_battle.png'

type Props = { onStart: () => void; onOptions: () => void; onHelp?: () => void;
  ranking?: DataPage<RankingEntry>; history?: DataPage<HistoryEntry>;
  rankingPage?: number; historyPage?: number;
  onRankingRetry?: () => void; onHistoryRetry?: () => void; onTabChange?: (tab: 'ranking' | 'history') => void;
  onRankingPageChange?: (page: number) => void; onHistoryPageChange?: (page: number) => void }
export default function MainMenu({ onStart, onOptions, onHelp, ranking = { status: 'empty' }, history = { status: 'empty' }, onRankingPageChange, onHistoryPageChange,
  rankingPage: controlledRankingPage, historyPage: controlledHistoryPage, onRankingRetry, onHistoryRetry, onTabChange }: Props) {
  const id = useId()
  const [tab, setTab] = useState<'ranking' | 'history'>('ranking')
  const [rankingPage, setRankingPage] = useState(1)
  const [historyPage, setHistoryPage] = useState(1)
  return <ScreenLayout title="Pirate Battle">
    <img className="menu-title" src={titleUrl} alt="" />
    <div className="screen-actions menu-actions">
      <button type="button" onClick={onStart}>Play</button>
      <button type="button" onClick={onOptions}>Options</button>
      <button type="button" onClick={onHelp}>How to Play</button>
    </div>

    <div className="menu-tabs" role="tablist" aria-label="Match records">
      {(['ranking', 'history'] as const).map(value => <button key={value} id={`${id}-${value}-tab`} type="button" role="tab"
        aria-selected={tab === value} aria-controls={`${id}-${value}-panel`} tabIndex={tab === value ? 0 : -1}
        onClick={() => { setTab(value); onTabChange?.(value) }} onKeyDown={event => {
          if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
            event.preventDefault(); const next = event.key === 'Home' ? 'ranking' : event.key === 'End' ? 'history' : value === 'ranking' ? 'history' : 'ranking'
            setTab(next); onTabChange?.(next); document.getElementById(`${id}-${next}-tab`)?.focus()
          }
        }}>{value === 'ranking' ? 'Ranking' : 'Match History'}</button>)}
    </div>
    <section role="tabpanel" hidden={tab !== 'ranking'} id={`${id}-ranking-panel`} aria-labelledby={`${id}-ranking-tab`} tabIndex={0}>
      <RankingPanel data={ranking} page={controlledRankingPage ?? rankingPage} onRetry={onRankingRetry} onPageChange={page => { if (controlledRankingPage === undefined) setRankingPage(page); onRankingPageChange?.(page) }} />
    </section>
    <section role="tabpanel" hidden={tab !== 'history'} id={`${id}-history-panel`} aria-labelledby={`${id}-history-tab`} tabIndex={0}>
      <HistoryPanel data={history} page={controlledHistoryPage ?? historyPage} onRetry={onHistoryRetry} onPageChange={page => { if (controlledHistoryPage === undefined) setHistoryPage(page); onHistoryPageChange?.(page) }} />
    </section>
  </ScreenLayout>
}
