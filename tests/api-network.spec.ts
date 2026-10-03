import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { MatchRecord } from '../src/api/contracts'
import type { NetworkScenario } from '../src/mocks/scenarios'
import { STORAGE_KEYS } from '../src/api/storage'

const match: MatchRecord = { matchId: 'network-match', playerId: 'network-player', playerName: 'Network Captain',
  date: '2026-10-02T12:00:00Z', score: 99, effectiveDuration: 70, endReason: 'playerDestroyed',
  gameConfig: { gameSessionTime: 120, enemySpawnTime: 5 } }
async function scenario(page: Page, value: NetworkScenario, latency = 0) {
  await page.evaluate(async ({ value, latency }) => {
    const modulePath = '/src/mocks/scenarios.ts'
    const { setScenario } = await import(modulePath)
    setScenario(value, { latency, seed: 42 })
  }, { value, latency })
}
async function installFinishControl(page: Page) {
  await page.evaluate(async () => {
    const modulePath = performance.getEntriesByType('resource').map(entry => entry.name).find(name => name.includes('/src/game/Game.ts')) ?? '/src/game/Game.ts'
    const { Game } = await import(modulePath)
    const original = Game.prototype.start
    Game.prototype.start = async function(host: HTMLElement) {
      await original.call(this, host)
      if (this.testController().observe().disposed) return
      host.dataset.ready = 'true'
      window.addEventListener('test-complete', () => {
        if (this.testController().observe().disposed) return
        this.world.score = 99
        this.testController().finish()
      }, { once: true })
    }
  })
}
async function completeMatch(page: Page) {
  await page.getByRole('button', { name: /^(Play|Play Again)$/ }).click()
  await expect(page.locator('.game-canvas')).toHaveAttribute('data-ready', 'true')
  await page.evaluate(() => window.dispatchEvent(new Event('test-complete')))
  await expect(page).toHaveURL(/\/result$/)
  await page.getByRole('button', { name: 'Save Result' }).click()
}
async function stored(page: Page, key: string): Promise<MatchRecord[]> {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '[]'), key)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/?network=1')
  await expect(page.getByRole('heading', { name: 'Pirate Battle' })).toBeVisible()
  await scenario(page, 'success')
})

test('POST is idempotent, survives refresh and updates both paginated endpoints', async ({ page }) => {
  const result = await page.evaluate(async match => {
    const path = '/src/api/client.ts'
    const { registerMatch, getHistory, getRanking } = await import(path)
    const first = await registerMatch(match)
    const duplicate = await registerMatch({ ...match, score: 1 })
    const repeats = await Promise.all(Array.from({ length: 5 }, () => registerMatch(match)))
    const history = await getHistory({ playerId: match.playerId, page: 1, pageSize: 5 })
    const ranking = await getRanking({ gameConfig: match.gameConfig, page: 1, pageSize: 5 })
    const secondPage = await getRanking({ gameConfig: match.gameConfig, page: 2, pageSize: 5 })
    return { first, duplicate, repeats, history, ranking, secondPage }
  }, match)
  expect(result.first).toEqual(result.duplicate)
  expect(result.repeats.every(item => item.match.matchId === match.matchId)).toBe(true)
  expect(result.history.totalItems).toBe(1)
  expect(result.ranking.items[0]).toMatchObject({ matchId: match.matchId, rank: 1 })
  expect(result.secondPage.items[0].rank).toBe(6)
  await page.reload()
  expect(await stored(page, STORAGE_KEYS.confirmed)).toEqual([match])
})

test('timeout after commit preserves the private result and deadline across refresh', async ({ page }) => {
  await scenario(page, 'timeout-after-register')
  await installFinishControl(page)
  await completeMatch(page)
  const queueKey = 'pirate-battle-registration-queue-v2'
  const queue = () => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '[]'), queueKey)
  await expect.poll(async () => (await queue())[0]?.status).toBe('Failed')
  const pending = await stored(page, STORAGE_KEYS.pending)
  expect(pending).toHaveLength(1)
  expect(await stored(page, STORAGE_KEYS.confirmed)).toEqual(pending)
  const deadline = (await queue())[0].nextAttemptAt
  await page.reload()
  expect((await queue())[0].nextAttemptAt).toBe(deadline)
  await expect(page.getByRole('status')).toHaveCount(0)
  await scenario(page, 'success')
  await page.clock.install()
  await page.clock.fastForward(Math.max(1, deadline - Date.now() + 1))
  await expect.poll(() => stored(page, STORAGE_KEYS.pending)).toEqual([])
  expect(await stored(page, STORAGE_KEYS.confirmed)).toEqual(pending)
  await page.getByRole('button', { name: 'Main Menu', exact: true }).click()
  await expect(page.getByRole('tabpanel').filter({ visible: true }).getByText('Captain', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: 'Match History' }).click()
  await expect(page.getByRole('tabpanel').filter({ visible: true }).getByText('99', { exact: true })).toBeVisible()
})

test('multiple unavailable registrations never block games and recover on their deadlines', async ({ page }) => {
  await scenario(page, 'unavailable-on-match-end')
  await installFinishControl(page)
  await completeMatch(page)
  await expect.poll(() => stored(page, STORAGE_KEYS.pending)).toHaveLength(1)
  await completeMatch(page)
  await expect.poll(() => stored(page, STORAGE_KEYS.pending)).toHaveLength(2)
  expect(await stored(page, STORAGE_KEYS.confirmed)).toHaveLength(0)
  await page.getByRole('button', { name: 'Main Menu', exact: true }).click()
  await expect(page.getByRole('complementary', { name: 'Pending registrations' })).toHaveCount(0)
  await scenario(page, 'success')
  await page.clock.install()
  await page.clock.fastForward(10_001)
  await expect.poll(() => stored(page, STORAGE_KEYS.confirmed)).toHaveLength(2)
  await expect.poll(() => stored(page, STORAGE_KEYS.pending)).toEqual([])
  await page.getByRole('tab', { name: 'Match History' }).click()
  await expect(page.getByRole('tabpanel').filter({ visible: true }).locator('tbody tr')).toHaveCount(2)
})

test('snapshot matches actual gameplay settings; refresh during combat registers nothing', async ({ page }) => {
  await installFinishControl(page)
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.locator('.game-canvas')).toHaveAttribute('data-ready', 'true')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Options', exact: true }).click()
  await page.getByRole('spinbutton', { name: 'Game Session Time in seconds' }).fill('180')
  await page.getByRole('spinbutton', { name: 'Enemy Spawn Time in seconds' }).fill('9')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.evaluate(() => window.dispatchEvent(new Event('test-complete')))
  await page.getByRole('button', { name: 'Save Result' }).click()
  await expect.poll(() => stored(page, STORAGE_KEYS.confirmed)).toHaveLength(1)
  const confirmed = await stored(page, STORAGE_KEYS.confirmed)
  expect(confirmed[0].gameConfig).toEqual({ gameSessionTime: 120, enemySpawnTime: 5 })
  await page.getByRole('button', { name: 'Play Again' }).click()
  const seed = await page.locator('.game-screen').getAttribute('data-seed')
  await page.reload()
  await expect(page.locator('.game-screen')).toHaveAttribute('data-seed', seed!)
  expect(await stored(page, STORAGE_KEYS.confirmed)).toHaveLength(1)
  expect(await stored(page, STORAGE_KEYS.pending)).toHaveLength(0)
  await expect(page.getByText('Time remaining: 180s')).toBeVisible()
})

for (const broken of ['ranking', 'history'] as const) {
  test(`${broken} failure leaves other queries, Options and gameplay available`, async ({ page }) => {
    await scenario(page, `${broken}-failure`)
    await page.reload()
    const tab = broken === 'ranking' ? 'Ranking' : 'Match History'
    await page.getByRole('tab', { name: tab }).click()
    const visible = page.getByRole('tabpanel').filter({ visible: true })
    await expect(visible.getByRole('alert')).toBeVisible()
    await expect(visible.getByRole('button', { name: 'Retry', exact: true })).toBeVisible()
    await page.getByRole('tab', { name: broken === 'ranking' ? 'Match History' : 'Ranking' }).click()
    await expect(visible.getByRole('alert')).toHaveCount(0)
    await expect(visible.getByText(broken === 'ranking' ? 'No records yet.' : 'Anne', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Options', exact: true }).click()
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.locator('canvas')).toBeVisible()
  })
}

test('background refetch keeps cached rows, and query keys isolate delayed config responses', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const queriesPath = '/src/api/queries.ts'
    const scenariosPath = '/src/mocks/scenarios.ts'
    const { queryClient, rankingOptions } = await import(queriesPath)
    const { setScenario } = await import(scenariosPath)
    const older = rankingOptions({ gameConfig: { gameSessionTime: 120, enemySpawnTime: 5 }, page: 2, pageSize: 3 })
    const newer = rankingOptions({ gameConfig: { gameSessionTime: 180, enemySpawnTime: 5 }, page: 1, pageSize: 3 })
    setScenario('out-of-order', { latency: 0, seed: 42 })
    const order: string[] = []
    const first = queryClient.fetchQuery(older).then((data: unknown) => { order.push('old'); return data })
    await new Promise(resolve => setTimeout(resolve, 30))
    const second = queryClient.fetchQuery(newer).then((data: unknown) => { order.push('new'); return data })
    await Promise.all([first, second])
    return { order, older: queryClient.getQueryData(older.queryKey), newer: queryClient.getQueryData(newer.queryKey) }
  })
  expect(result.order).toEqual(['new', 'old'])
  expect(result.older.items.every((item: MatchRecord) => item.gameConfig.gameSessionTime === 120)).toBe(true)
  expect(result.newer.items.every((item: MatchRecord) => item.gameConfig.gameSessionTime === 180)).toBe(true)
  await scenario(page, 'slow', 1000)
  await page.getByRole('tab', { name: 'Ranking' }).click()
  const panel = page.getByRole('tabpanel').filter({ visible: true })
  await expect(panel.getByText('Refreshing…')).toBeVisible()
  await expect(panel.locator('tbody tr')).toHaveCount(5)
})

test('successful retry invalidates only matching configuration and player caches', async ({ page }) => {
  await page.evaluate(async () => {
    const path = '/src/api/queries.ts'
    const { queryClient, rankingOptions, historyOptions } = await import(path)
    await Promise.all([
      queryClient.fetchQuery(rankingOptions({ gameConfig: { gameSessionTime: 120, enemySpawnTime: 5 }, page: 1, pageSize: 5 })),
      queryClient.fetchQuery(rankingOptions({ gameConfig: { gameSessionTime: 180, enemySpawnTime: 5 }, page: 1, pageSize: 5 })),
      queryClient.fetchQuery(historyOptions({ playerId: 'network-player', page: 1, pageSize: 5 })),
      queryClient.fetchQuery(historyOptions({ playerId: 'unrelated', page: 1, pageSize: 5 })),
    ])
  })
  await page.evaluate(async match => {
    const path = performance.getEntriesByType('resource').map(entry => entry.name).find(name => name.includes('/src/api/pending.ts')) ?? '/src/api/pending.ts'
    const { enqueuePending } = await import(path)
    enqueuePending(match)
  }, match)
  await expect.poll(() => stored(page, STORAGE_KEYS.pending)).toEqual([])
  const states = await page.evaluate(async () => {
    const path = '/src/api/queries.ts'
    const { queryClient, queryKeys } = await import(path)
    const changed = queryClient.getQueryState(queryKeys.historyPage({ playerId: 'network-player', page: 1, pageSize: 5 }))
    const unrelated = queryClient.getQueryState(queryKeys.historyPage({ playerId: 'unrelated', page: 1, pageSize: 5 }))
    const otherConfig = queryClient.getQueryState(queryKeys.rankingPage({ gameConfig: { gameSessionTime: 180, enemySpawnTime: 5 }, page: 1, pageSize: 5 }))
    return { changed: changed?.isInvalidated, unrelated: unrelated?.isInvalidated, otherConfig: otherConfig?.isInvalidated }
  })
  expect(states).toEqual({ changed: true, unrelated: false, otherConfig: false })
})

for (const value of ['timeout', 'network-error', 'http-400', 'http-500'] as const) {
  test(`Axios normalizes ${value}`, async ({ page }) => {
    await scenario(page, value)
    const error = await page.evaluate(async () => {
      const path = '/src/api/client.ts'
      const { getHistory } = await import(path)
      try { await getHistory({ playerId: 'one', page: 1, pageSize: 5 }); return null }
      catch (error) { const value = error as { kind: string; status?: number }; return { kind: value.kind, status: value.status } }
    })
    expect(error?.kind).toBe({ timeout: 'timeout', 'network-error': 'network', 'http-400': 'client', 'http-500': 'server' }[value])
    if (value === 'http-400') expect(error?.status).toBe(400)
    if (value === 'http-500') expect(error?.status).toBe(500)
  })
}

test('developer reset explicitly clears confirmed and pending and restores fixtures', async ({ page }) => {
  await page.evaluate(async match => {
    const clientPath = '/src/api/client.ts'
    const pendingPath = performance.getEntriesByType('resource').map(entry => entry.name).find(name => name.includes('/src/api/pending.ts')) ?? '/src/api/pending.ts'
    const { registerMatch } = await import(clientPath)
    const { enqueuePending } = await import(pendingPath)
    await registerMatch(match)
    enqueuePending({ ...match, matchId: 'another' })
  }, match)
  await page.getByText('Developer / Network Scenarios', { exact: true }).click()
  await page.getByRole('button', { name: 'Reset confirmed + pending records', exact: true }).click()
  expect(await stored(page, STORAGE_KEYS.confirmed)).toEqual([])
  expect(await stored(page, STORAGE_KEYS.pending)).toEqual([])
  await expect(page.getByRole('complementary')).toHaveCount(0)
  await expect(page.getByRole('tabpanel').filter({ visible: true }).getByText('Anne', { exact: true })).toBeVisible()
})
