import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { UseQueryResult } from '@tanstack/react-query'
import MainMenu from '../screens/MainMenu/MainMenu'
import { historyOptions, rankingOptions } from '../api/queries'
import type { GameConfigSnapshot, PageResponse } from '../api/contracts'
import type { DataPage } from './MatchData'

function toPanel<T, U>(query: UseQueryResult<PageResponse<T>>, map: (item: T) => U, message: string): DataPage<U> {
  if (query.data) return { status: 'data', items: query.data.items.map(map), hasNext: query.data.page < query.data.totalPages,
    refreshing: query.isFetching, message: query.isError ? message : undefined }
  if (query.isError) return { status: 'error', message, refreshing: query.isFetching }
  return { status: 'loading' }
}
export default function ConnectedMainMenu({ config, playerId, onStart, onOptions, onHelp }: {
  config: GameConfigSnapshot; playerId: string; onStart: () => void; onOptions: () => void; onHelp: () => void
}) {
  const [rankingPage, setRankingPage] = useState(1)
  const [historyPage, setHistoryPage] = useState(1)
  const ranking = useQuery(rankingOptions({ gameConfig: config, page: rankingPage, pageSize: 5 }))
  const history = useQuery(historyOptions({ playerId, page: historyPage, pageSize: 5 }))
  return <MainMenu onStart={onStart} onOptions={onOptions} onHelp={onHelp}
    ranking={toPanel(ranking, item => ({ id: item.matchId, matchId: item.matchId, playerId: item.playerId, playerName: item.playerName, score: item.score, rank: item.rank, duration: item.effectiveDuration }), "Couldn't load the leaderboard.")}
    history={toPanel(history, item => ({ id: item.matchId, date: item.date, score: item.score, duration: item.effectiveDuration, reason: item.endReason }), "Couldn't load match history.")}
    rankingPage={rankingPage} historyPage={historyPage}
    onRankingPageChange={setRankingPage} onHistoryPageChange={setHistoryPage}
    onRankingRetry={() => { if (!ranking.isFetching) void ranking.refetch({ cancelRefetch: false }) }} onHistoryRetry={() => { if (!history.isFetching) void history.refetch({ cancelRefetch: false }) }}
    onTabChange={tab => { if (tab === 'ranking') void ranking.refetch(); else void history.refetch() }} />
}
