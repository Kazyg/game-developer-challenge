import { test, expect } from '@playwright/test'
import { World } from '../src/game/world/World'
import { createEnemy } from '../src/game/entities/Enemy'
import { fireWeapon, updateProjectiles } from '../src/game/combat/CombatSystem'
import { shipAssetIndex } from '../src/game/rendering/ShipAppearance'

function arena() {
  const world = new World(42, { combatEnabled: false })
  world.islandColliders.splice(0)
  return world
}
function enemy(world: World, type: 'chaser' | 'shooter', x: number, y = 2000) {
  const target = createEnemy(world.nextId('enemy'), type, world.patrolAreas[0]!, { x, y }, 42)
  world.enemies.push(target)
  return target
}
for (const type of ['chaser', 'shooter'] as const) {
  for (const ratio of [1, 0.5, 0.2]) {
    test(`sweep hits ${type} at HP ratio ${ratio} in one fast step`, () => {
      const world = arena(), target = enemy(world, type, 2100)
      const colliders = target.colliders
      target.hp = target.maxHp * ratio
      expect(target.colliders).toEqual(colliders)
      expect(shipAssetIndex(type, target.hp, target.maxHp)).toBeDefined()
      const hp = target.hp
      fireWeapon(world, world.player, 'right')
      world.projectiles.splice(0, 1)
      world.projectiles.splice(1)
      const projectile = world.projectiles[0]!
      projectile.speed = 12000
      const start = { ...projectile.position }
      updateProjectiles(world, 1 / 60)
      expect(projectile.previousPosition).toEqual(start)
      expect(target.hp).toBe(Math.max(0, hp - projectile.damage))
      expect(world.projectiles).toHaveLength(0)
    })
  }
}
test('earliest ship wins regardless of array order; wreck is ignored', () => {
  const world = arena(), far = enemy(world, 'shooter', 2180), near = enemy(world, 'shooter', 2100)
  fireWeapon(world, world.player, 'right')
  world.projectiles.splice(0, 1); world.projectiles.splice(1)
  world.projectiles[0]!.speed = 24000
  updateProjectiles(world, 1 / 60)
  expect(near.hp).toBe(45); expect(far.hp).toBe(60)
  near.alive = false
  world.player.weaponCooldowns.right = 0
  fireWeapon(world, world.player, 'right')
  world.projectiles.splice(0, 1); world.projectiles.splice(1)
  world.projectiles[0]!.speed = 24000
  updateProjectiles(world, 1 / 60)
  expect(far.hp).toBe(45)
})
test('last range/lifetime segment hits, but targets beyond range and nearby misses do not', () => {
  for (const mode of ['range', 'lifetime', 'beyond', 'miss']) {
    const world = arena(), target = enemy(world, 'shooter', mode === 'beyond' ? 2200 : 2100, mode === 'miss' ? 2100 : 2000)
    fireWeapon(world, world.player, 'right')
    world.projectiles.splice(0, 1); world.projectiles.splice(1)
    const projectile = world.projectiles[0]!
    projectile.speed = 12000
    projectile.range = 100
    if (mode === 'lifetime') projectile.lifetime = 100 / projectile.speed
    updateProjectiles(world, 1 / 60)
    expect(target.hp).toBe(mode === 'beyond' || mode === 'miss' ? 60 : 45)
    expect(world.projectiles).toHaveLength(0)
  }
})
test('menu survives repeated visibility/focus cycles before and after gameplay', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  for (const afterGame of [false, true]) {
    if (afterGame) {
      await page.getByRole('button', { name: 'Play', exact: true }).click()
      await expect(page.locator('canvas')).toBeVisible()
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: 'Main Menu', exact: true }).click()
    }
    await page.getByRole('tab', { name: 'Match History' }).click()
    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => {
        for (const state of ['hidden', 'visible']) {
          Object.defineProperty(document, 'visibilityState', { configurable: true, value: state })
          document.dispatchEvent(new Event('visibilitychange'))
        }
        window.dispatchEvent(new Event('blur'))
        window.dispatchEvent(new Event('focus'))
      })
      await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
      await expect(page.getByRole('tab', { name: 'Match History' })).toHaveAttribute('aria-selected', 'true')
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(page.locator('[inert], canvas, .game-modal-backdrop')).toHaveCount(0)
      await expect(page).toHaveURL('/')
    }
  }
  expect(errors).toEqual([])
})

test('collision is checked at the exact range endpoint', () => {
  const world = arena()
  fireWeapon(world, world.player, 'front')
  const projectile = world.projectiles[0]!
  projectile.range = 1
  const start = { ...projectile.position }
  world.islandColliders.push({ type: 'circle', position: {
    x: start.x, y: start.y - 1 - projectile.radius * 1.25 - 2,
  }, radius: 2 })
  updateProjectiles(world, 1 / 60)
  expect(world.effects.filter(effect => effect.kind === 'impact')).toHaveLength(1)
  expect(projectile.position.y).toBe(start.y - 1)
})

test('fast broadside preserves three independent hits or one surviving pair', () => {
  for (const narrow of [false, true]) {
    const world = arena(), target = enemy(world, 'shooter', 2100)
    if (narrow) target.rotation = Math.PI / 2
    fireWeapon(world, world.player, 'right')
    for (const projectile of world.projectiles) {
      projectile.speed = 12000
      // Aim each independent entity through the real hull for the three-hit fixture.
      if (!narrow) projectile.position.y = target.position.y
    }
    updateProjectiles(world, 1 / 60)
    expect(target.hp).toBe(narrow ? 45 : 15)
    expect(world.projectiles).toHaveLength(narrow ? 2 : 0)
    expect(world.effects.filter(effect => effect.kind === 'impact')).toHaveLength(narrow ? 1 : 3)
  }
})
