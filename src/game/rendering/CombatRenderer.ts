import { Assets, Container, Graphics, Sprite } from 'pixi.js'
import type { Texture } from 'pixi.js'
import { GAME_CONFIG } from '../config/GameConfig'
import { COMBAT_CONFIG as config } from '../config/CombatConfig'
import type { World } from '../world/World'
import { loadShipTextures } from './ShipTextures'
import { removeMissing, destroyDisplay } from './collections'
import { damageStage } from './ShipAppearance'
import { inViewport } from './Viewport'
import type { Viewport } from './Viewport'
import type { ShipKind } from './ShipAppearance'
import cannonballUrl from '../../../assets/png/retina/ship_parts/cannon_ball.png'
import shotUrl from '../../../assets/png/retina/effects/fire_1.png'
import explosion1Url from '../../../assets/png/retina/effects/explosion_1.png'
import explosion2Url from '../../../assets/png/retina/effects/explosion_2.png'
import explosion3Url from '../../../assets/png/retina/effects/explosion_3.png'

export class CombatRenderer {
  readonly container = new Container()
  private readonly shipLayer = new Container()
  private readonly projectileLayer = new Container()
  private readonly effectLayer = new Container()
  private readonly ships = new Map<string, Sprite>()
  private readonly projectiles = new Map<string, Sprite>()
  private readonly effects = new Map<string, Sprite>()
  private readonly splashes = new Map<string, Graphics>()
  private readonly trails = new Map<string, Graphics>()
  private readonly crew = new Map<string, Sprite>()
  private fleet: Record<ShipKind, Texture[]> | undefined
  private flagTextures: Texture[] = []
  private readonly wrecks = new Map<string, Sprite>()
  private textures: Texture[] = []
  private disposed = false

  constructor() {
    this.container.addChild(this.shipLayer, this.projectileLayer, this.effectLayer)
  }

  observe() {
    return { ships: this.ships.size,
      shipDisplays: [...this.ships].map(([id, sprite]) => ({ id, uid: sprite.uid, visible: sprite.visible })),
      visibleShips: [...this.ships].filter(([, sprite]) => sprite.visible).map(([id]) => id) }
  }

  async initialize(fleetTask = loadShipTextures()) {
    const fleet = await fleetTask
    const flags = await Promise.all([1, 3, 5].map(index => Assets.load<Texture>(new URL(`../../../assets/png/default/ship_parts/flag_${index}.png`, import.meta.url).href)))
    const textures = await Promise.all([cannonballUrl, shotUrl,
      explosion1Url, explosion2Url, explosion3Url,
      new URL('../../../assets/png/retina/ship_parts/crew_1.png', import.meta.url).href,
      new URL('../../../assets/png/retina/ship_parts/crew_2.png', import.meta.url).href,
      new URL('../../../assets/png/retina/ship_parts/crew_3.png', import.meta.url).href].map((url) => Assets.load<Texture>(url)))
    if (!this.disposed) { this.textures = textures; this.fleet = fleet; this.flagTextures = flags }
  }

  private sprite(id: string, texture: Texture, cache: Map<string, Sprite>, layer: Container): Sprite {
    let sprite = cache.get(id)
    if (!sprite) {
      sprite = new Sprite(texture)
      sprite.anchor.set(0.5)
      cache.set(id, sprite)
      layer.addChild(sprite)
    }
    sprite.texture = texture
    return sprite
  }


  render(world: World, endingAge = 0, viewport?: Viewport) {
    const alive = world.enemies.filter((enemy) => enemy.alive)
    removeMissing(this.ships, new Set(alive.map((enemy) => enemy.id)), destroyDisplay)
    for (const enemy of alive) {
      const visible = inViewport(enemy.position, 80, viewport)
      const existing = this.ships.get(enemy.id)
      if (existing) existing.visible = visible
      if (!visible) continue
      const sprite = this.sprite(enemy.id, this.fleet![enemy.type][damageStage(enemy.hp, enemy.maxHp)]!, this.ships, this.shipLayer)
      sprite.visible = true
      sprite.position.set(enemy.position.x, enemy.position.y)
      sprite.rotation = enemy.rotation + GAME_CONFIG.spriteRotationOffset
      sprite.scale.set(GAME_CONFIG.enemySpriteScale)
    }
    removeMissing(this.projectiles, new Set(world.projectiles.map((projectile) => projectile.id)), destroyDisplay)
    const projectileIds = new Set(world.projectiles.map(projectile => projectile.id))
    removeMissing(this.trails, projectileIds, destroyDisplay)
    for (const projectile of world.projectiles) {
      const sizeMultiplier = projectile.radius / config.projectile.radius
      const visible = inViewport(projectile.position, 16 * sizeMultiplier, viewport)
      const existing = this.projectiles.get(projectile.id)
      if (existing) existing.visible = visible
      const oldTrail = this.trails.get(projectile.id)
      if (oldTrail) oldTrail.visible = visible
      if (!visible) continue
      const sprite = this.sprite(projectile.id, this.textures[0]!, this.projectiles, this.projectileLayer)
      sprite.visible = true
      sprite.position.set(projectile.position.x, projectile.position.y)
      sprite.scale.set(config.projectile.spriteScale * sizeMultiplier)
      let trail = this.trails.get(projectile.id)
      if (!trail) {
        trail = new Graphics().moveTo(0, 0).lineTo(0, config.effects.trailLength).stroke({ color: 0xffe2ad, width: 2, alpha: 0.3 })
        this.trails.set(projectile.id, trail)
        this.projectileLayer.addChildAt(trail, 0)
      }
      trail.visible = visible
      trail.position.set(projectile.position.x, projectile.position.y)
      trail.rotation = Math.atan2(projectile.direction.x, -projectile.direction.y)
    }
    removeMissing(this.effects, new Set(world.effects.map((effect) => effect.id)), destroyDisplay)
    const splashIds = new Set(world.effects.filter(effect => effect.kind === 'splash').map(effect => effect.id))
    removeMissing(this.splashes, splashIds, destroyDisplay)
    const crewIds = new Set<string>()
    for (const effect of world.effects) {
      const visible = inViewport(effect.position, 128, viewport)
      const oldSplash = this.splashes.get(effect.id)
      if (oldSplash) oldSplash.visible = visible
      const existing = this.effects.get(effect.id)
      if (existing) existing.visible = visible
      if (!visible) continue
      const progress = Math.min(1, (effect.age + endingAge) / effect.duration)
      if (effect.kind === 'splash') {
        let splash = this.splashes.get(effect.id)
        if (!splash) {
          splash = new Graphics().ellipse(0, 0, 10, 5).stroke({ color: 0xd8ffff, width: 2 })
            .ellipse(0, 0, 5, 2.5).stroke({ color: 0xf4ffff, width: 1 })
          this.splashes.set(effect.id, splash)
          this.effectLayer.addChild(splash)
        }
        splash.position.set(effect.position.x, effect.position.y)
        splash.scale.set(0.5 + progress * 1.7)
        splash.alpha = (1 - progress) * 0.7
        splash.visible = visible
        continue
      }
      const index = effect.kind === 'shot' ? 1 : effect.kind === 'impact' ? 4
        : 2 + Math.min(2, Math.floor(progress * 3))
      const sprite = this.sprite(effect.id, this.textures[index]!, this.effects, this.effectLayer)
      sprite.visible = true
      sprite.position.set(effect.position.x, effect.position.y)
      sprite.rotation = effect.rotation
      sprite.alpha = 1 - progress
      const scale = effect.kind === 'shot' ? config.effects.shotScale
        : effect.kind === 'impact' ? config.effects.impactScale : config.effects.explosionScale
      sprite.scale.set(scale)
      if (effect.kind === 'explosion') {
        for (let i = 0; i < 3; i++) {
          const id = `${effect.id}-crew-${i}`
          crewIds.add(id)
          const person = this.sprite(id, this.textures[5 + i]!, this.crew, this.effectLayer)
          const angle = effect.rotation + i * Math.PI * 2 / 3 + 0.4
          person.position.set(effect.position.x + Math.cos(angle) * progress * 65,
            effect.position.y + Math.sin(angle) * progress * 65 - Math.sin(progress * Math.PI) * 24)
          person.rotation = angle + progress * 3
          person.scale.set(0.65)
          person.alpha = 1 - progress
        }
      }
    }
    removeMissing(this.crew, crewIds, destroyDisplay)
    const visibleWrecks = world.wrecks.filter(wreck => wreck.age + endingAge < wreck.duration)
    removeMissing(this.wrecks, new Set(visibleWrecks.map(wreck => wreck.id)), destroyDisplay)
    for (const wreck of visibleWrecks) {
      const visible = inViewport(wreck.position, 100, viewport)
      const existing = this.wrecks.get(wreck.id)
      if (existing) existing.visible = visible
      if (!visible) continue
      const sprite = this.sprite(wreck.id, this.fleet![wreck.kind][3]!, this.wrecks, this.shipLayer)
      sprite.visible = true
      if (!sprite.children.length) {
        const flag = new Sprite(this.flagTextures[wreck.kind === 'player' ? 0 : wreck.kind === 'chaser' ? 1 : 2]!)
        flag.anchor.set(0.5)
        flag.position.set(0, -37)
        sprite.addChild(flag)
      }
      const progress = Math.min(1, (wreck.age + endingAge) / wreck.duration)
      sprite.position.set(wreck.position.x, wreck.position.y + 20 * progress)
      sprite.rotation = wreck.rotation + GAME_CONFIG.spriteRotationOffset
      sprite.scale.set((wreck.kind === 'player' ? GAME_CONFIG.playerSpriteScale : GAME_CONFIG.enemySpriteScale) * (1 - progress * 0.15))
      sprite.alpha = 1 - progress * progress
    }
  }

  destroy() {
    if (this.disposed) return
    this.disposed = true
    this.container.destroy({ children: true })
    this.ships.clear()
    this.projectiles.clear()
    this.effects.clear()
    this.crew.clear()
    this.splashes.clear()
    this.trails.clear()
    this.wrecks.clear()
  }
}
