import { test, expect } from '@playwright/test'
import { initializeAssets } from '../src/game/rendering/initializeAssets'
import { readFileSync } from 'node:fs'
import { cutout } from '../scripts/prepare-cutouts.mjs'

test('parallel initialization waits for delayed work after rejection and observes every failure', async () => {
  let settle: (() => void) | undefined
  let finished = false
  const delayed = new Promise<void>(resolve => { settle = () => { finished = true; resolve() } })
  const task = initializeAssets([Promise.reject(new Error('first')), delayed, Promise.reject(new Error('second'))])
  let rejected = false
  const observed = task.catch(error => { rejected = true; expect(error.message).toBe('first') })
  await Promise.resolve()
  expect(rejected).toBe(false)
  settle?.()
  await observed
  expect(finished).toBe(true)
  expect(rejected).toBe(true)
})

test('cutouts reproduce the versioned output from original sources', () => {
  for (const index of [81, 82, 83, 84]) {
    const source = readFileSync(`assets/png/default/tiles/tile_${index}.png`)
    expect(cutout(source)).toEqual(readFileSync(`assets/generated/cutouts/tile_${index}.png`))
  }
})

test('partial local texture generation releases owned textures and preserves cache for recovery', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const path = '/src/testing/rendering.ts'
    return (await import(path)).verifyTextureOwnershipFailure()
  })
  expect(result).toEqual({ failed: true, released: true, sharedAlive: true, orphanCount: 0, recovered: true })
})

for (const action of ['exit', 'retry'] as const) test(`failed asset and delayed load settle safely through ${action}`, async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  let fail = true
  let release: (() => void) | undefined
  await page.context().route('**/assets/png/default/ships/ship_1.png*', route => fail && route.request().resourceType() !== 'script' ? route.abort() : route.continue())
  await page.context().route('**/assets/png/retina/tiles/tile_27.png*', async route => {
    if (route.request().resourceType() === 'script' || !fail) return route.continue()
    await new Promise<void>(resolve => { release = resolve })
    await route.continue()
  })
  await page.goto('/?seed=42')
  await page.evaluate(async () => {
    const path = performance.getEntriesByType('resource').map(entry => entry.name).find(name => name.includes('/src/game/Game.ts')) ?? '/src/game/Game.ts'
    const { Game } = await import(path)
    const starts: unknown[] = []
    Object.assign(window, { __assetStarts: starts })
    const original = Game.prototype.start
    Game.prototype.start = function(host: HTMLElement) {
      const controller = this.testController()
      starts.push(controller)
      return original.call(this, host)
    }
  })
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect.poll(() => !!release).toBe(true)
  if (action === 'exit') {
    await page.getByRole('button', { name: 'Pause', exact: true }).click()
    await page.getByRole('button', { name: 'Main Menu', exact: true }).click()
  }
  fail = false
  release?.()
  if (action === 'exit') await page.getByRole('button', { name: 'Play', exact: true }).click()
  else {
    await expect(page.getByRole('alert')).toBeVisible()
    await page.getByRole('button', { name: 'Retry', exact: true }).click()
  }
  await expect(page.locator('canvas')).toHaveCount(1)
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await expect.poll(() => page.evaluate(() => {
    const controllers = (window as unknown as { __assetStarts: { observe: () => { disposed: boolean; localTextures: number } }[] }).__assetStarts
    const retired = controllers.filter(controller => controller.observe().disposed)
    return retired.length > 0 && retired.every(controller => controller.observe().localTextures === 0)
      && controllers.filter(controller => !controller.observe().disposed).length === 1
  })).toBe(true)
  expect(errors).toEqual([])
})
