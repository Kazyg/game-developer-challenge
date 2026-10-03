import { expect, test } from '@playwright/test'
const match = { matchId: 'named-result', seed: 42, playerId: 'named-player', playerName: 'Captain',
  date: '2026-10-02T12:00:00Z', score: 4, effectiveDuration: 70, endReason: 'playerDestroyed',
  gameConfig: { gameSessionTime: 120, enemySpawnTime: 5 } }
for (const name of ['Anne!@#$ 123', '']) {
  test(`optional result name saves once with sanitized name: ${name || 'default'}`, async ({ page }) => {
    await page.addInitScript(match => {
      localStorage.setItem('pirate-battle-lastCompletedMatch-v1', JSON.stringify({ match, seed: 42, status: 'Pending', awaitingName: true }))
    }, match)
    await page.goto('/result')
    await expect(page.getByLabel('Player name (optional)')).toBeVisible()
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pirate-battle-confirmed-v1') ?? '[]'))).toEqual([])
    await page.reload()
    await page.getByLabel('Player name (optional)').fill(name)
    await expect(page.getByLabel('Player name (optional)')).toHaveValue(name ? 'Anne 123' : '')
    await page.getByRole('button', { name: 'Main Menu', exact: true }).click()
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('pirate-battle-confirmed-v1') ?? '[]'))).toEqual([{ ...match, playerName: name ? 'Anne 123' : 'Captain' }])
    await expect(page.getByText('Match Registration Status')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Retry Registration' })).toHaveCount(0)
  })
}
test('in-game Options has one scroll owner in mobile landscape', async ({ page }) => {
  test.setTimeout(60000)
  await page.setViewportSize({ width: 844, height: 390 })
  await page.goto('/?seed=42')
  await page.getByRole('button', { name: 'How to Play', exact: true }).click()
  await expect(page).toHaveURL('/help')
  await expect(page.getByText('Toggle debug')).toHaveCount(0)
  await expect(page.getByText('Esc', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.locator('canvas')).toBeVisible()
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  await page.getByRole('button', { name: 'Options', exact: true }).click()
  expect(await page.locator('.game-modal .screen').evaluate(element => getComputedStyle(element).overflowY)).toBe('hidden')
  expect(await page.locator('.screen-content').evaluate(element => getComputedStyle(element).overflowY)).toBe('auto')
  await page.getByLabel('Mute sound').check()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByRole('button', { name: 'Main Menu', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
})
