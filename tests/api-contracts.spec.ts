import { test, expect } from '@playwright/test'
import type { MatchRecord } from '../src/api/contracts'
import { validMatch } from '../src/api/contracts'
import { history, paginate, ranking } from '../src/mocks/state'

const config = { gameSessionTime: 120, enemySpawnTime: 5 }
const make = (matchId: string, values: Partial<MatchRecord> = {}): MatchRecord => ({
  matchId, playerId: 'one', playerName: 'Captain', date: '2026-09-01T00:00:00Z',
  score: 10, effectiveDuration: 100, endReason: 'playerDestroyed', gameConfig: config, ...values,
})
test('ranking uses all four tie breakers, exact config and absolute paginated ranks', () => {
  const records = [make('z'), make('b'), make('a'), make('early', { date: '2026-08-01T00:00:00Z' }),
    make('short', { effectiveDuration: 50 }), make('high', { score: 30 }),
    make('wrong-time', { score: 100, gameConfig: { ...config, gameSessionTime: 180 } }),
    make('wrong-spawn', { score: 200, gameConfig: { ...config, enemySpawnTime: 6 } })]
  const sorted = ranking(records, config)
  expect(sorted.map(match => match.matchId)).toEqual(['high', 'short', 'early', 'a', 'b', 'z'])
  const page = paginate(sorted, { page: 2, pageSize: 2 })
  expect(page).toMatchObject({ page: 2, pageSize: 2, totalItems: 6, totalPages: 3 })
  expect(page.items.map(match => match.rank)).toEqual([3, 4])
  expect(paginate(sorted, { page: 4, pageSize: 2 }).items).toEqual([])
})
test('history filters player and resolves equal dates by ID', () => {
  const records = [make('z'), make('a'), make('new', { date: '2026-09-02T00:00:00Z' }), make('other', { playerId: 'two' })]
  expect(history(records, 'one').map(match => match.matchId)).toEqual(['new', 'a', 'z'])
  expect(history(records, 'absent')).toEqual([])
})
test('only valid completed matches are accepted', () => {
  expect(validMatch(make('valid'))).toBe(true)
  for (const values of [{ endReason: 'abandoned' }, { score: -1 }, { effectiveDuration: 200 }, { date: 'bad' }, { matchId: '' }, { gameConfig: { gameSessionTime: 20, enemySpawnTime: 5 } }]) {
    expect(validMatch({ ...make('bad'), ...values })).toBe(false)
  }
})
