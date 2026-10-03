import { test, expect } from '@playwright/test'
import type { MatchRecord } from '../../src/api/contracts'
import { STORAGE_KEYS } from '../../src/api/storage'

test('published build starts MSW and recovers persisted pending through the network', async ({ page }) => {
  const match: MatchRecord = { matchId: 'production-match', playerId: 'production-player', playerName: 'Production Captain',
    date: '2026-10-02T12:00:00Z', score: 99, effectiveDuration: 70, endReason: 'playerDestroyed',
    gameConfig: { gameSessionTime: 120, enemySpawnTime: 5 } }
  await page.addInitScript(({ match, keys }) => {
    localStorage.setItem(keys.player, JSON.stringify({ playerId: match.playerId, playerName: match.playerName }))
    localStorage.setItem(keys.pending, JSON.stringify([match]))
  }, { match, keys: STORAGE_KEYS })
  await page.goto('/?network=1')
  const ranking = page.getByRole('tabpanel').filter({ visible: true })
  await expect(ranking.getByText('Anne', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toContain('mockServiceWorker.js')
  await expect(page.getByRole('complementary')).toHaveCount(0)
  await expect(ranking.getByText('Production Captain', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: 'Match History' }).click()
  await expect(page.getByRole('tabpanel').filter({ visible: true }).getByText('99', { exact: true })).toBeVisible()
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '[]'), STORAGE_KEYS.confirmed)).toEqual([match])
})
