import { test, expect } from '@playwright/test'
import { damageStage, shipAssetIndex } from '../src/game/rendering/ShipAppearance'
import { COMBAT_CONFIG } from '../src/game/config/CombatConfig'
import { GAME_CONFIG } from '../src/game/config/GameConfig'
import { World } from '../src/game/world/World'
import { createEnemy } from '../src/game/entities/Enemy'
import { damageShip } from '../src/game/combat/CombatSystem'
import { pointInPolygon } from '../src/game/collision/CollisionSystem'
import { generateIslandDecorations } from '../src/game/world/IslandDecorations'
import { ISLAND_SHAPES } from '../src/game/world/IslandShapes'
import { ISLAND_SIZE_PROFILES } from '../src/game/world/IslandSizes'
import { STRUCTURE_TILE_IDS } from '../src/game/world/IslandStructures'

const idle = { up: false, down: false, left: false, right: false }
test('exact HP thresholds use inspected ship sequences for every type', () => {
  expect([100, 60, 30, 0].map(hp => shipAssetIndex('player', hp, 100))).toEqual([1, 7, 13, 19])
  expect([40, 24, 12, 0].map(hp => shipAssetIndex('chaser', hp, 40))).toEqual([3, 9, 15, 21])
  expect([60, 36, 18, 0].map(hp => shipAssetIndex('shooter', hp, 60))).toEqual([5, 11, 17, 23])
  expect(damageStage(60.01, 100)).toBe(0)
  expect(damageStage(30.01, 100)).toBe(1)
  expect(damageStage(0.01, 100)).toBe(2)
})

test('larger islands and 24 seeded areas cover all sectors with every area initially populated', () => {
  for (let seed = 0; seed < 30; seed++) {
    const world = new World(seed)
    expect(world.patrolAreas).toHaveLength(24)
    const cells = new Set(world.patrolAreas.map(area => Math.floor(area.x / 800) + 5 * Math.floor(area.y / 800)))
    expect(cells.size).toBe(24)
    expect(cells.has(12)).toBe(false)
    for (const island of world.islands) {
      const profile = ISLAND_SIZE_PROFILES[island.sizeCategory!]
      expect(island.size).toBeGreaterThanOrEqual(profile.min)
      expect(island.size).toBeLessThanOrEqual(profile.max)
      expect(island.colliders).toHaveLength(1)
    }
    expect(world.islands.reduce((sum, island) => sum + island.size, 0) / world.islands.length).toBeGreaterThan(270)
    expect(world.patrolAreas).toEqual(new World(seed).patrolAreas)
  }
  const world = new World(42)
  world.islands.splice(0); world.islandColliders.splice(0)
  world.spawner.update(world)
  expect(world.enemies).toHaveLength(COMBAT_CONFIG.spawn.maxPopulation)
  expect(GAME_CONFIG.islandMinDistance).toBe(140)
})

test('decoration follows inland clusters and coastal rock bands, deterministically', () => {
  const used = new Set<number>()
  for (const shape of ISLAND_SHAPES) for (const seed of [42, 1, 12]) {
    const details = generateIslandDecorations(shape, seed)
    expect(details).toEqual(generateIslandDecorations(shape, seed))
    for (const detail of details) {
      if (STRUCTURE_TILE_IDS.includes(detail.tile)) continue
      used.add(detail.tile)
      expect(pointInPolygon(detail.position, shape.outline)).toBe(true)
      if (detail.region === 'interior') expect(pointInPolygon(detail.position, shape.outline.map(p => ({ x: p.x * 0.66, y: p.y * 0.66 })))).toBe(true)
      else expect(pointInPolygon(detail.position, shape.outline.map(p => ({ x: p.x * 0.78, y: p.y * 0.78 })))).toBe(false)
    }
  }
  expect([...used].sort((a,b) => a-b)).toEqual([49, 51, 70, 72, 87, 88])
})

test('sprites swap in place, keep flags and colliders, and dead hulls sink without gameplay', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const path = '/src/game/Game.ts', enemyPath = '/src/game/entities/Enemy.ts', combatPath = '/src/game/combat/CombatSystem.ts', configPath = '/src/game/config/GameConfig.ts'
    const { Game } = await import(path)
    const { createEnemy } = await import(enemyPath)
    const { damageShip, chaserContact, fireWeapon } = await import(combatPath)
    const { GAME_CONFIG } = await import(configPath)
    const game = new Game(42)
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;inset:0'; document.body.append(host)
    const chaser = createEnemy('visual-chaser', 'chaser', game.world.patrolAreas[0], { x: 2100, y: 2000 }, 42)
    const shooter = createEnemy('visual-shooter', 'shooter', game.world.patrolAreas[0], { x: 2200, y: 2000 }, 42)
    game.world.enemies.push(chaser, shooter)
    await game.start(host); game.app.stop()
    const ships = [game.world.player, chaser, shooter]
    const checks = []
    for (const ship of ships) {
      const kind = ship.team === 'player' ? 'player' : ship.type
      const sprite = kind === 'player' ? game.view.playerSprite : game.view.combatView.ships.get(ship.id)
      const textures = kind === 'player' ? game.view.playerTextures : game.view.combatView.fleet[kind]
      const pose = JSON.stringify({ position: ship.position, rotation: ship.rotation, colliders: ship.colliders })
      const flag = game.view.damageView.overlays.get(ship.id).children[0].texture
      for (const [stage, ratio] of [1, 0.6, 0.3].entries()) {
        ship.hp = ship.maxHp * ratio; game.render()
        checks.push(sprite.texture === textures[stage], sprite.scale.x === GAME_CONFIG.playerSpriteScale,
          JSON.stringify({ position: ship.position, rotation: ship.rotation, colliders: ship.colliders }) === pose,
          game.view.damageView.overlays.get(ship.id).children[0].texture === flag,
          (kind === 'player' ? game.view.playerSprite : game.view.combatView.ships.get(ship.id)) === sprite)
      }
    }
    damageShip(game.world, shooter, shooter.hp, 'player'); game.render()
    const wreck = game.world.wrecks.find(w => w.kind === 'shooter')
    const visual = game.view.combatView.wrecks.get(wreck.id)
    const before = { x: visual.x, y: visual.y, alpha: visual.alpha }
    const score = game.world.score
    damageShip(game.world, shooter, 100, 'player')
    checks.push(shooter.state === 'DEAD', !game.view.healthView.bars.has(shooter.id),
      visual.texture === game.view.combatView.fleet.shooter[3], game.world.score === score,
      !fireWeapon(game.world, shooter, 'front'), game.world.canPlayerPose(shooter.position, 0))
    const flag = game.view.damageView.overlays.get(chaser.id).children[0].texture
    chaserContact(game.world, chaser); game.render()
    checks.push(game.world.score === score)
    const chaserWreck = game.world.wrecks.find(w => w.kind === 'chaser')
    checks.push(game.view.combatView.wrecks.get(chaserWreck.id).children[0].texture === flag)
    wreck.age = 1.5; game.render()
    checks.push(visual.y > before.y, visual.x === before.x, visual.alpha < before.alpha, !visual.destroyed)
    wreck.age = 3; game.render()
    checks.push(visual.destroyed, !game.view.combatView.wrecks.has(wreck.id))
    damageShip(game.world, game.world.player, 100); game.render()
    const playerWreck = game.world.wrecks.find(w => w.kind === 'player')
    checks.push(game.view.combatView.wrecks.get(playerWreck.id).texture === game.view.combatView.fleet.player[3], !game.view.healthView.bars.has('player'))
    game.destroy(); host.remove()
    return checks
  })
  expect(result.map((value, index) => value ? -1 : index).filter(index => index >= 0)).toEqual([])
})

test('desktop mouse holds movement, quick clicks fire, and cooldown/Repair/Pause give feedback', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(async () => {
    const path = performance.getEntriesByType('resource').map(entry => entry.name).find(name => name.includes('/src/game/Game.ts')) ?? '/src/game/Game.ts'
    const { Game } = await import(path)
    const original = Game.prototype.start
    const output = document.createElement('output'); output.id = 'adjust-read'; output.hidden = true; document.body.append(output)
    Game.prototype.start = async function(host: HTMLElement) {
      await original.call(this, host); if (this.disposed) return
      this.world.player.hp = 50
      // Keep this controls test independent of enemy attacks during Repair.
      this.world.enemies.splice(0)
      this.world.spawner.update = () => {}
      let totalShots = 0
      const nextId = this.world.nextId.bind(this.world)
      this.world.nextId = (prefix: string) => { if (prefix === 'projectile') totalShots++; return nextId(prefix) }
      window.addEventListener('adjust-read', () => { if (!this.disposed) output.textContent = JSON.stringify({ position: this.world.player.position,
        rotation: this.world.player.rotation, projectiles: this.world.projectiles.length, totalShots, repair: this.world.player.repair }) })
    }
  })
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.getByRole('status')).toHaveCount(0)
  const read = async () => { await page.evaluate(() => window.dispatchEvent(new Event('adjust-read'))); return JSON.parse((await page.locator('#adjust-read').textContent())!) }
  const forward = page.getByRole('button', { name: 'Forward', exact: true })
  const box = (await forward.boundingBox())!
  const initial = await read()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down()
  await expect(forward).toHaveAttribute('data-active', 'true')
  await page.keyboard.down('KeyA')
  await expect.poll(async () => (await read()).rotation).toBeLessThan(initial.rotation)
  await expect.poll(async () => (await read()).position.y).toBeLessThan(initial.position.y)
  await page.mouse.up(); await page.keyboard.up('KeyA')
  const fire = page.getByRole('button', { name: 'Front Shot', exact: true })
  await fire.click()
  await expect(fire).toHaveAttribute('data-cooldown', 'true')
  await expect(fire.locator('.command-cooldown')).toBeVisible()
  await page.getByRole('button', { name: 'Left Broadside', exact: true }).click()
  await page.getByRole('button', { name: 'Right Broadside', exact: true }).click()
  await expect.poll(async () => (await read()).totalShots).toBeGreaterThanOrEqual(7)
  await page.getByRole('button', { name: 'Repair', exact: true }).click()
  await expect.poll(async () => (await read()).repair.active).toBe(true)
  await page.keyboard.down('KeyW'); await page.keyboard.up('KeyW')
  // Hold movement until a simulation step cancels repair.
  await forward.hover(); await page.mouse.down()
  await expect.poll(async () => (await read()).repair.cooldown).toBeGreaterThan(0)
  await page.mouse.up()
  await expect(page.getByRole('button', { name: 'Repair', exact: true }).locator('.command-cooldown')).toBeVisible()
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Pause Menu' })).toBeVisible()
  await expect(forward).toBeDisabled()
  await page.getByRole('button', { name: 'Resume', exact: true }).click()
  await expect(forward).toHaveAttribute('data-active', 'false')
  await page.keyboard.press('KeyU')
  await page.screenshot({ path: 'test-results/adjustments-hud-debug.png' })
})

test('wreck snapshots age with simulation, pause freezes them, and never retain a blocker or score twice', () => {
  const world = new World(42, { combatEnabled: false })
  world.islands.splice(0); world.islandColliders.splice(0)
  const enemy = createEnemy('wreck', 'shooter', world.patrolAreas[0]!, { x: 2100, y: 2000 }, 42)
  world.enemies.push(enemy)
  damageShip(world, enemy, enemy.hp, 'player')
  const position = { ...enemy.position }
  const wreck = world.wrecks[0]!
  expect(world.canPlayerPose(position, 0)).toBe(true)
  expect(world.score).toBe(1)
  world.update(idle, 0.5)
  expect(wreck.age).toBeCloseTo(0.5)
  world.paused = true; world.update(idle, 2)
  expect(wreck.age).toBeCloseTo(0.5)
  world.paused = false
  damageShip(world, enemy, 100, 'player')
  world.update(idle, 2.5)
  expect(world.wrecks).toHaveLength(0)
  expect(world.score).toBe(1)
  expect(enemy.position).toEqual(position)
})
