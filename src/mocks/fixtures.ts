import type { MatchRecord } from '../api/contracts'

export const fixtures: MatchRecord[] = Array.from({ length: 24 }, (_, index) => ({
  matchId: `fixture-${String(index + 1).padStart(3, '0')}`,
  playerId: `pirate-${index % 8}`, playerName: ['Anne', 'Jack', 'Mary', 'Edward', 'Grace', 'Henry', 'Samuel', 'Zheng'][index % 8],
  date: new Date(Date.UTC(2026, 8, 1, 0, index)).toISOString(),
  score: 20 - Math.floor(index / 3), effectiveDuration: 80 + index % 3,
  endReason: 'playerDestroyed',
  gameConfig: { gameSessionTime: index < 18 ? 120 : 180, enemySpawnTime: 5 },
}))
