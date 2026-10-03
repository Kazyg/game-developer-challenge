import { expect, test } from '@playwright/test'

test('new fort silhouettes use connected native walls and corners on solid terrain', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/')
  const names = await page.evaluate(async () => {
    const pixiPath = performance.getEntriesByType('resource').map(entry => entry.name).find(name => name.includes('/pixi__js.js'))!
    const structuresPath = '/src/game/world/IslandStructures.ts'
    const { Application, Assets, Container, Graphics, Sprite, Text } = await import(pixiPath)
    const { STRUCTURE_PRESETS } = await import(structuresPath)
    const selected = STRUCTURE_PRESETS.filter((preset: { name: string }) => ['m-fort','c-fort','p-fort','connected-squares'].includes(preset.name))
    const app = new Application()
    await app.init({ width: 1280, height: 900, background: '#239db0', antialias: true, autoStart: false })
    const host = document.createElement('div')
    host.style.cssText = 'position:fixed;inset:0;z-index:100'
    host.append(app.canvas); document.body.append(host)
    const textures = new Map()
    for (const id of new Set(selected.flatMap((preset: { pieces: { tile: number }[] }) => preset.pieces.map(piece => piece.tile)))) {
      textures.set(id, await Assets.load(`/assets/png/default/tiles/tile_${id}.png`))
    }
    for (const [index, preset] of selected.entries()) {
      const center = { x: index % 2 * 640 + 320, y: Math.floor(index / 2) * 450 + 230 }
      const group = new Container()
      group.position.set(center.x, center.y)
      const terrain = new Graphics().roundRect(-280,-175,560,350,55).fill(0xeecb8b)
        .roundRect(-260,-155,520,310,45).fill(0x8eb64d)
      group.addChild(terrain)
      const label = new Text({ text: preset.name, style: { fill: '#ffffff', fontSize: 22, fontFamily: 'sans-serif' } })
      label.anchor.set(0.5); label.position.set(0,-200); group.addChild(label)
      for (const piece of preset.pieces) {
        const sprite = new Sprite(textures.get(piece.tile)); sprite.anchor.set(0.5)
        sprite.position.set(piece.x * 40, piece.y * 40)
        sprite.scale.set(40 / 64); sprite.rotation = piece.rotation ?? 0
        group.addChild(sprite)
      }
      app.stage.addChild(group)
    }
    app.renderer.render(app.stage)
    window.addEventListener('preview-cleanup', () => { app.destroy(true, { children: true }); host.remove() }, { once: true })
    return selected.map((preset: { name: string }) => preset.name)
  })
  expect(names).toEqual(['m-fort','c-fort','p-fort','connected-squares'])
  await page.screenshot({ path: 'test-results/new-forts-review.png' })
  await page.evaluate(() => window.dispatchEvent(new Event('preview-cleanup')))
})

test('projectile trails and expiry ripple render, freeze with pause and release on exit', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const gamePath = '/src/game/Game.ts', combatPath = '/src/game/combat/CombatSystem.ts'
    const { Game } = await import(gamePath)
    const { fireWeapon, updateProjectiles, addEffect } = await import(combatPath)
    const game = new Game(42)
    game.world.paused = true
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;inset:0;z-index:100'; document.body.append(host)
    await game.start(host); game.app.stop()
    game.world.paused = false; game.world.enemies.splice(0); game.world.islandColliders.splice(0)
    fireWeapon(game.world, game.world.player, 'front'); fireWeapon(game.world, game.world.player, 'right')
    updateProjectiles(game.world, 0.15)
    addEffect(game.world, 'splash', { x: game.world.player.position.x + 110, y: game.world.player.position.y - 70 })
    game.world.paused = true; game.render(); game.app.renderer.render(game.app.stage)
    const age = game.world.effects.at(-1).age
    game.world.update({ up: false, left: false, right: false }, 1)
    window.addEventListener('preview-cleanup', () => { game.destroy(); host.remove() }, { once: true })
    return { projectiles: game.world.projectiles.length, trails: game.view.combatView.trails.size,
      ripples: game.view.combatView.splashes.size, frozen: game.world.effects.at(-1).age === age }
  })
  expect(result).toEqual({ projectiles: 4, trails: 4, ripples: 1, frozen: true })
  await page.screenshot({ path: 'test-results/projectile-effects-review.png' })
  await page.evaluate(() => window.dispatchEvent(new Event('preview-cleanup')))
  await expect(page.locator('canvas')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
})
