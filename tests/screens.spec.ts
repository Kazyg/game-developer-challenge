import { test, expect } from '@playwright/test'
test('game dialogs fit and saving returns to pause', async ({ page }) => {
  await page.goto('/game')
  await expect(page.locator('canvas')).toBeVisible()
  await page.getByRole('button', { name: 'How to Play' }).click()
  const resume = page.getByRole('button', { name: 'Resume', exact: true })
  expect((await resume.boundingBox())!.width).toBeLessThanOrEqual(240)
  await expect(resume).toHaveCSS('background-size', 'contain')
  await resume.click()
  await page.keyboard.press('Escape')
  const pauseButtons = page.getByRole('dialog', { name: 'Pause Menu' }).getByRole('button')
  const buttonBounds = await pauseButtons.evaluateAll(buttons => buttons.map(button => {
    const { x, width } = button.getBoundingClientRect()
    return { x, width }
  }))
  for (const bounds of buttonBounds) {
    expect(bounds).toEqual(buttonBounds[0])
  }
  await expect(pauseButtons.first()).toHaveClass('pause-resume')
  await page.getByRole('button', { name: 'Options', exact: true }).click()
  for (const viewport of [{ width: 1280, height: 720 }, { width: 375, height: 667 }, { width: 667, height: 375 }]) {
    await page.setViewportSize(viewport)
    const dialog = page.getByRole('dialog', { name: 'Options', exact: true })
    const bounds = (await dialog.boundingBox())!
    expect(bounds.x).toBeGreaterThanOrEqual(0)
    expect(bounds.y).toBeGreaterThanOrEqual(0)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width)
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height)
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  }
  await page.getByRole('spinbutton', { name: 'Enemy Spawn Time in seconds' }).fill('7')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Pause Menu' })).toBeVisible()
})

for (const width of [1280, 375]) {
  test(`screens/save/persistence at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Pirate Battle', exact: true })).toHaveCount(1)
    await page.getByRole('tab', { name: 'Ranking' }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('tab', { name: 'Match History' })).toBeFocused()
    await expect(page.getByRole('tab', { name: 'Match History' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('tabpanel').filter({ visible: true }).getByText('No records yet.')).toBeVisible()
    await expect(page.getByRole('tabpanel').filter({ visible: true }).getByRole('button', { name: 'Next' })).toBeDisabled()
    await page.getByRole('button', { name: 'Options', exact: true }).click()
    const time = page.getByRole('spinbutton', { name: 'Game Session Time in seconds' })
    const spawn = page.getByRole('spinbutton', { name: 'Enemy Spawn Time in seconds' })
    await time.fill('59')
    await expect(time).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByText('Enter a whole number from 60 to 180 seconds.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled()
    await time.fill('150')
    await spawn.fill('0')
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled()
    await spawn.fill('7')
    const slider = page.getByRole('slider', { name: 'Enemy Spawn Time: 7s' })
    expect((await slider.boundingBox())!.width).toBeGreaterThan(width === 375 ? 260 : 400)
    expect((await slider.boundingBox())!.height).toBeGreaterThanOrEqual(48)
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page).toHaveURL('/')
    await page.reload()
    await page.getByRole('button', { name: 'Options', exact: true }).click()
    await expect(time).toHaveValue('150')
    await expect(spawn).toHaveValue('7')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `test-results/options-${width}.png`, fullPage: true })
    await page.getByRole('button', { name: 'Save' }).click()
    await page.screenshot({ path: `test-results/menu-${width}.png`, fullPage: true })
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.locator('canvas')).toHaveCount(1)
    await expect(page.getByText('Time remaining: 150s')).toBeVisible()
  })
}

test('record panels accept data, paginate and render all states without an API', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(async () => {
    const menuPath = '/src/screens/MainMenu/MainMenu.tsx'
    const reactPath = '/node_modules/.vite/deps/react.js'
    const domPath = '/node_modules/.vite/deps/react-dom_client.js'
    const { default: Menu } = await import(menuPath)
    const react = await import(reactPath); const createElement = (react.default ?? react).createElement
    const dom = await import(domPath); const createRoot = (dom.default ?? dom).createRoot
    document.getElementById('root')!.hidden = true
    const host = document.createElement('div'); document.body.append(host)
    const root = createRoot(host)
    const render = (status = 'data', page = 1) => root.render(createElement(Menu, {
      onStart: () => {}, onOptions: () => {},
      ranking: status === 'data' ? { status, hasNext: page === 1, items: [{ id: 'test', rank: page, playerName: `Captain ${page}`, score: 10 }] } : { status },
      history: status === 'data' ? { status, hasNext: page === 1, items: [{ id: 'match', date: '2026-10-01T12:00:00Z', score: 8, duration: 120, reason: 'timeExpired' }] } : { status },
      onRankingPageChange: (value: number) => render('data', value), onHistoryPageChange: (value: number) => render('data', value),
    }))
    for (const state of ['loading', 'error', 'empty']) window.addEventListener(`test-panel-${state}`, () => render(state))
    render()
  })
  await expect(page.getByText('Captain 1')).toBeVisible()
  await page.getByRole('tabpanel').filter({ visible: true }).getByRole('button', { name: 'Next' }).click()
  await expect(page.getByRole('tabpanel').filter({ visible: true }).getByText('Page 2')).toBeVisible()
  await expect(page.getByText('Captain 2')).toBeVisible()
  await page.getByRole('tabpanel').filter({ visible: true }).getByRole('button', { name: 'Previous' }).click()
  await page.getByRole('tab', { name: 'Match History' }).click()
  await expect(page.getByRole('columnheader', { name: 'Date' })).toBeVisible()
  await expect(page.getByText('120s')).toBeVisible()
  await expect(page.getByText('Time Expired')).toBeVisible()
  await page.getByRole('tabpanel').filter({ visible: true }).getByRole('button', { name: 'Next' }).click()
  await expect(page.getByRole('tabpanel').filter({ visible: true }).getByText('Page 2')).toBeVisible()
  for (const state of ['loading', 'error', 'empty']) {
    await page.evaluate(value => window.dispatchEvent(new Event(`test-panel-${value}`)), state)
    await expect(page.getByRole('tabpanel').filter({ visible: true }).getByRole(state === 'error' ? 'alert' : 'status')).toBeVisible()
  }
})



test('mobile results show supplied values, optional name and Save Result', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')
  await page.evaluate(async () => {
    const path = '/src/screens/Result/ResultScreen.tsx'
    const reactPath = '/node_modules/.vite/deps/react.js'
    const domPath = '/node_modules/.vite/deps/react-dom_client.js'
    const { default: Result } = await import(path)
    const react = await import(reactPath); const { createElement } = react.default ?? react
    const dom = await import(domPath); const { createRoot } = dom.default ?? dom
    document.getElementById('root')!.hidden = true
    const host = document.createElement('main'); host.className = 'app'; document.body.append(host)
    const root = createRoot(host)
    const render = (registrationStatus: string) => root.render(createElement(Result, {
      result: { score: 17, elapsedSeconds: 83.5, seed: 42, reason: 'playerDestroyed', outcome: 'defeat' },
      canName: registrationStatus !== 'Saved', onSaveName: () => render('Saved'), onRestart: () => {}, onBack: () => {},
    }))
    window.addEventListener('test-registration', event => render((event as CustomEvent<string>).detail))
    render('Pending')
  })
  await expect(page.getByText('17', { exact: true })).toBeVisible()
  await expect(page.getByText('83s', { exact: true })).toBeVisible()
  await expect(page.getByText('Player Destroyed', { exact: true })).toBeVisible()
  for (const value of ['Pending', 'Saving', 'Saved', 'Failed']) {
    await page.evaluate(status => window.dispatchEvent(new CustomEvent('test-registration', { detail: status })), value)
    await expect(page.getByRole('status')).toHaveCount(0)
    await expect(page.getByRole('textbox', { name: 'Player name (optional)' })).toHaveCount(value === 'Saved' ? 0 : 1)
  }
  await page.getByRole('textbox', { name: 'Player name (optional)' }).fill('Captain Test')
  await page.getByRole('button', { name: 'Save Result' }).click()
  await expect(page.getByRole('textbox')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/result-375.png', fullPage: true })
})
