import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { MatchRecord } from '../src/api/contracts'
import { REGISTRATION_RETRY } from '../src/api/RegistrationPolicy'
const match: MatchRecord = { matchId: 'auto-recovery', playerId: 'auto-player', playerName: 'Recovery Captain',
  date: '2026-10-02T12:00:00Z', score: 99, effectiveDuration: 70, endReason: 'playerDestroyed',
  gameConfig: { gameSessionTime: 120, enemySpawnTime: 5 } }
const queueKey = 'pirate-battle-registration-queue-v2'
async function configure(page: Page, mode: 'fail' | 'success', delayMs = 0) {
  await page.evaluate(async ({ mode, delayMs }) => {
    const path = '/src/testing/api.ts'
    const api = await import(path)
    api.useRegistrationResponses(mode, delayMs)
  }, { mode, delayMs })
}
async function submit(page: Page, payload = match) {
  await page.evaluate(async match => { const path = '/src/testing/api.ts'; const api = await import(path); api.enqueuePending(match) }, payload)
}
async function attempts(page: Page) {
  return page.evaluate(async () => { const path = '/src/testing/api.ts'; return (await import(path)).observeRequests().attempts })
}
async function queue(page: Page) { return page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '[]'), queueKey) }
async function failure(page: Page, count: number) {
  await expect.poll(() => attempts(page)).toBe(count)
  await expect.poll(async () => (await queue(page))[0]?.status).toBe('Failed')
}
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('tabpanel').filter({ visible: true }).getByText('Anne', { exact: true })).toBeVisible()
  const now = new Date('2026-10-03T12:00:00Z')
  await page.clock.install({ time: now })
  await page.clock.pauseAt(now)
})

test('failed durable attempt reservation sends no POST and preserves the retry budget', async ({ page }) => {
  await configure(page, 'fail')
  await submit(page)
  await failure(page, 1)
  const original = (await queue(page))[0]
  await page.evaluate(key => {
    const setItem = Storage.prototype.setItem
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new DOMException('Storage full', 'QuotaExceededError')
      return setItem.call(this, name, value)
    }
    window.addEventListener('restore-storage', () => { Storage.prototype.setItem = setItem }, { once: true })
  }, queueKey)
  await page.clock.fastForward(REGISTRATION_RETRY.delaysMs[0])
  await expect(page.getByText('Unable to persist registration state. Free storage and retry.')).toBeVisible()
  expect(await attempts(page)).toBe(1)
  expect((await queue(page))[0]).toEqual(original)
  await page.clock.fastForward(3_600_000)
  expect(await attempts(page)).toBe(1)
  await page.evaluate(() => window.dispatchEvent(new Event('restore-storage')))
  await configure(page, 'success')
  await page.getByRole('button', { name: 'Retry Registration' }).click()
  await expect.poll(() => queue(page)).toEqual([])
  expect(await attempts(page)).toBe(2)
})

test('five failure-relative intervals, six attempts, exhausted results and explicit manual recovery', async ({ page }) => {
  await configure(page, 'fail')
  await submit(page)
  await failure(page, 1)
  for (const [index, delay] of REGISTRATION_RETRY.delaysMs.entries()) {
    const state = (await queue(page))[0]
    expect(state.retriesPerformed).toBe(index)
    expect(state.nextAttemptAt).toBe(await page.evaluate(() => Date.now()) + delay)
    await page.clock.fastForward(delay - 1)
    expect(await attempts(page)).toBe(index + 1)
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    expect(await attempts(page)).toBe(index + 1)
    await page.clock.fastForward(1)
    await failure(page, index + 2)
  }
  expect((await queue(page))[0]).toMatchObject({ match, retriesPerformed: 5, exhausted: true, nextAttemptAt: 0 })
  await page.clock.fastForward(3_600_000)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  expect(await attempts(page)).toBe(6)
  await expect(page.getByText('Automatic attempts exhausted. Your result is saved locally.')).toBeVisible()
  // A failed manual attempt is one explicit POST and leaves the automatic budget exhausted.
  await page.getByRole('button', { name: 'Retry Registration' }).click()
  await failure(page, 7)
  await page.clock.fastForward(3_600_000)
  expect(await attempts(page)).toBe(7)
  await configure(page, 'success', 100)
  await page.getByRole('button', { name: 'Retry Registration' }).evaluate(button => { button.click(); button.click(); button.click() })
  await expect.poll(() => attempts(page)).toBe(8)
  await page.clock.fastForward(100)
  await expect.poll(() => queue(page)).toEqual([])
  expect(await attempts(page)).toBe(8)
  const concurrency = await page.evaluate(async () => { const path = '/src/testing/api.ts'; return (await import(path)).observeRequests().maxActive })
  expect(concurrency).toBe(1)
})

test('offline scheduler consumes no attempt and reconnect respects the existing deadline', async ({ page, context }) => {
  await configure(page, 'fail')
  await submit(page)
  await failure(page, 1)
  await context.setOffline(true)
  await page.clock.fastForward(20_000)
  expect(await attempts(page)).toBe(1)
  expect((await queue(page))[0].retriesPerformed).toBe(0)
  await configure(page, 'success')
  await context.setOffline(false)
  await expect.poll(() => queue(page)).toEqual([])
  expect(await attempts(page)).toBe(2)
})

test('refresh preserves payload, consumed retries and a future deadline', async ({ page }) => {
  await configure(page, 'fail')
  await submit(page)
  await failure(page, 1)
  await page.clock.fastForward(10_000)
  await failure(page, 2)
  const state = (await queue(page))[0]
  await page.reload()
  await configure(page, 'success')
  expect((await queue(page))[0]).toMatchObject({ match, retriesPerformed: 1, nextAttemptAt: state.nextAttemptAt })
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  expect(await attempts(page)).toBe(0)
  await page.clock.fastForward(29_999)
  expect(await attempts(page)).toBe(0)
  await page.clock.fastForward(1)
  await expect.poll(() => queue(page)).toEqual([])
  expect(await attempts(page)).toBe(1)
})

test('overdue recovery executes the next attempt once and schedules from its new failure', async ({ page }) => {
  await page.evaluate(({ match, queueKey }) => {
    localStorage.setItem(queueKey, JSON.stringify([{ match, durable: true, status: 'Failed', initialStarted: true,
      retriesPerformed: 2, nextAttemptAt: Date.now() - 3_600_000, exhausted: false }]))
  }, { match, queueKey })
  await configure(page, 'fail')
  await page.evaluate(() => window.dispatchEvent(new Event('storage')))
  await failure(page, 1)
  expect((await queue(page))[0]).toMatchObject({ retriesPerformed: 3, nextAttemptAt: await page.evaluate(() => Date.now()) + 600_000 })
})

test('new matches remain available with pending records and abandoned games do not enqueue', async ({ page }) => {
  await configure(page, 'fail')
  await submit(page)
  await failure(page, 1)
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.locator('canvas')).toBeVisible()
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  await page.getByRole('button', { name: 'Main Menu', exact: true }).click()
  expect((await queue(page)).map((item: {match: MatchRecord}) => item.match)).toEqual([match])
})

test('delayed failures start the next interval after failure rather than request start', async ({ page }) => {
  await configure(page, 'fail', 250)
  await submit(page)
  await expect.poll(() => attempts(page)).toBe(1)
  await page.clock.fastForward(249)
  expect((await queue(page))[0].status).toBe('Saving')
  await page.clock.fastForward(1)
  await failure(page, 1)
  expect((await queue(page))[0].nextAttemptAt).toBe(await page.evaluate(() => Date.now()) + 10_000)
})

test('two tabs serialize one due match without duplicating a consumed retry', async ({ page, context }) => {
  const now = await page.evaluate(() => Date.now())
  await page.evaluate(({ match, queueKey, now }) => {
    localStorage.setItem(queueKey, JSON.stringify([{ match, durable: true, status: 'Failed', initialStarted: true,
      retriesPerformed: 0, nextAttemptAt: now + 10_000, exhausted: false }]))
    window.dispatchEvent(new Event('storage'))
  }, { match, queueKey, now })
  await configure(page, 'fail')
  const other = await context.newPage()
  await other.goto('/')
  await configure(other, 'fail')
  // Playwright clock is context-wide: one advance drives both tabs.
  await page.clock.fastForward(10_000)
  await expect.poll(async () => await attempts(page) + await attempts(other)).toBe(1)
  await expect.poll(async () => (await queue(page))[0].status).toBe('Failed')
  expect((await queue(page))[0]).toMatchObject({ retriesPerformed: 1, match, nextAttemptAt: now + 40_000 })
  await other.close()
})

test('interrupted final retry stays manual-only after refresh and remains usable', async ({ page }) => {
  await page.evaluate(({ match, queueKey }) => {
    localStorage.setItem(queueKey, JSON.stringify([{ match, durable: true, status: 'Saving', initialStarted: true,
      retriesPerformed: 5, nextAttemptAt: 0, exhausted: true }]))
  }, { match, queueKey })
  await page.reload()
  await configure(page, 'success')
  const manual = page.getByRole('button', { name: 'Retry Registration' })
  await expect(manual).toBeEnabled()
  expect(await attempts(page)).toBe(0)
  await manual.click()
  await expect.poll(() => queue(page)).toEqual([])
  expect(await attempts(page)).toBe(1)
})
