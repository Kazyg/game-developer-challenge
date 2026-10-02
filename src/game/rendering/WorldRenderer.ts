import { navigationClearance, ROUTE_MARGIN } from '../ai/PatrolNavigation'
import { COMBAT_CONFIG } from '../config/CombatConfig'
import { Assets, Container, Graphics, Rectangle, Sprite, Texture, TilingSprite } from 'pixi.js'
import type { Application } from 'pixi.js'
import { GAME_CONFIG as config } from '../config/GameConfig'
import type { Camera } from '../camera/Camera'
import type { World } from '../world/World'
import { getIslandShape } from '../world/IslandShapes'
import type { IslandShape } from '../world/IslandShapes'
import { loadShipTextures } from './ShipTextures'
import { damageStage } from './ShipAppearance'
import oceanUrl from '../../../assets/png/retina/tiles/tile_73.png'
import sandUrl from '../../../assets/png/default/tiles/tile_68.png'
import grassUrl from '../../../assets/png/default/tiles/tile_23.png'
import { CombatRenderer } from './CombatRenderer'
import { HealthBarRenderer } from './HealthBarRenderer'
import { DamageRenderer } from './DamageRenderer'
import { generateIslandDecorations } from '../world/IslandDecorations'
import { STRUCTURE_TILE_IDS } from '../world/IslandStructures'
import { leashBounds } from '../ai/EnemySystem'
import type { Viewport } from './Viewport'

export class WorldRenderer {
  readonly container = new Container()
  private playerTextures: Texture[] = []
  private playerSprite: Sprite | undefined
  private islandSprites: Sprite[] = []
  private generatedTextures: Texture[] = []
  private surfaceTextures: Texture[] = []
  private debugGraphics: Graphics | undefined
  private disposed = false
  private debugColliders: boolean
  private readonly combatView = new CombatRenderer()
  private readonly healthView = new HealthBarRenderer()
  private readonly damageView = new DamageRenderer()
  private endingAge = 0
  private viewport: Viewport | undefined
  private ocean: TilingSprite | undefined

  constructor(debugColliders: boolean = config.debugColliders) {
    this.debugColliders = debugColliders
  }

  toggleDebugColliders() {
    this.debugColliders = !this.debugColliders
    if (this.debugGraphics) this.debugGraphics.visible = this.debugColliders
  }

  private createSeamlessTexture(app: Application, texture: Texture): Texture {
    // Mirrored 2x2 tiles meet at identical edge pixels, avoiding rectangular seams.
    const composition = new Container()
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
      const sprite = new Sprite(texture)
      sprite.scale.set(x === 0 ? 1 : -1, y === 0 ? 1 : -1)
      sprite.position.set(x * texture.width * 2, y * texture.height * 2)
      composition.addChild(sprite)
    }
    const result = app.renderer.generateTexture(composition)
    composition.destroy({ children: true })
    return result
  }

  private createIslandTexture(app: Application, shape: IslandShape, sand: Texture, grass: Texture, details: Map<number, Texture>, shallow: Texture, seed: number, islandSize: number): Texture {
    const composition = new Container()
    const radius = shape.boundingRadius * config.islandTextureSize * 1.15
    const addSurface = (texture: Texture, inset: number) => {
      const surface = new TilingSprite({ texture, width: radius * 2, height: radius * 2 })
      surface.position.set(-radius, -radius)
      const outline = shape.outline.flatMap((p) => [
        p.x * config.islandTextureSize * inset,
        p.y * config.islandTextureSize * inset,
      ])
      const mask = new Graphics().poly(outline).fill(0xffffff)
      surface.mask = mask
      composition.addChild(surface, mask)
    }
    // Shallow-water tiles are masked beyond the shore and have no physical collider.
    const halo = new TilingSprite({ texture: shallow, width: radius * 2, height: radius * 2 })
    halo.position.set(-radius, -radius)
    halo.alpha = 1
    halo.tint = 0x91edec
    const haloMask = new Graphics().poly(shape.outline.flatMap(p => [p.x * config.islandTextureSize * 1.12, p.y * config.islandTextureSize * 1.12])).fill(0xffffff)
    halo.mask = haloMask
    composition.addChild(halo, haloMask)
    addSurface(sand, 1)
    if (shape.vegetation) addSurface(grass, config.islandVegetationInset)
    for (const decoration of generateIslandDecorations(shape, seed, islandSize)) {
      const sprite = new Sprite(details.get(decoration.tile)!)
      sprite.anchor.set(0.5)
      sprite.position.set(decoration.position.x * config.islandTextureSize, decoration.position.y * config.islandTextureSize)
      sprite.scale.set(decoration.scale)
      sprite.rotation = decoration.rotation
      composition.addChild(sprite)
    }
    const texture = app.renderer.generateTexture({
      target: composition,
      frame: new Rectangle(-radius, -radius, radius * 2, radius * 2),
    })
    composition.destroy({ children: true })
    return texture
  }

  async initialize(app: Application, world: World): Promise<void> {
    const [fleet, oceanTexture, sand, grass, details, shallow] = await Promise.all([
      loadShipTextures(), Assets.load<Texture>(oceanUrl),
      Assets.load<Texture>(sandUrl), Assets.load<Texture>(grassUrl),
      Promise.all([...new Set([49, 51, 70, 72, 87, 88, ...STRUCTURE_TILE_IDS])].map(async index => {
        const texture = await Assets.load<Texture>(new URL(`../../../assets/png/default/tiles/tile_${index}.png`, import.meta.url).href)
        if (index < 81 || index > 84) return [index, texture] as const
        // These four assets bake sand (and sometimes grass) behind the objects.
        // Key that background in native pixels, retaining brown timber and blue/gray metal.
        const canvas = document.createElement('canvas')
        canvas.width = texture.width
        canvas.height = texture.height
        const context = canvas.getContext('2d')!
        context.drawImage(texture.source.resource as HTMLImageElement, 0, 0)
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
        for (let i = 0; i < pixels.data.length; i += 4) {
          const r = pixels.data[i]!, g = pixels.data[i + 1]!, b = pixels.data[i + 2]!
          const y = Math.floor(i / 4 / canvas.width)
          // All four objects end before row 55; the dark wavy sand edge must
          // also disappear even though it shares timber's darker colors.
          if (y >= 55 || (g > 155 && r > b) || (g > r && g > b)) pixels.data[i + 3] = 0
        }
        context.putImageData(pixels, 0, 0)
        const cutout = Texture.from(canvas)
        this.surfaceTextures.push(cutout)
        return [index, cutout] as const
      })),
      Assets.load<Texture>(new URL('../../../assets/png/retina/tiles/tile_27.png', import.meta.url).href),
      this.combatView.initialize(),
      this.healthView.initialize(),
      this.damageView.initialize(),
    ])
    if (this.disposed) {
      this.surfaceTextures.forEach(texture => texture.destroy(true))
      this.surfaceTextures = []
      return
    }

    const ocean = new TilingSprite({ texture: oceanTexture, width: world.width, height: world.height })
    this.ocean = ocean
    ocean.tileScale.set(config.oceanTileScale)
    this.container.addChild(ocean)
    this.surfaceTextures.push(this.createSeamlessTexture(app, sand), this.createSeamlessTexture(app, grass))
    const sandSurface = this.surfaceTextures[this.surfaceTextures.length - 2]!
    const grassSurface = this.surfaceTextures[this.surfaceTextures.length - 1]!
    this.generatedTextures = world.islands.map((island, index) =>
      this.createIslandTexture(app, getIslandShape(island), sandSurface, grassSurface, new Map(details), shallow!, world.seed ^ ((index + 1) * 0x45d9f3b), island.size))
    this.islandSprites = world.islands.map((island, index) => {
      const sprite = new Sprite(this.generatedTextures[index]!)
      sprite.anchor.set(0.5)
      sprite.position.set(island.position.x, island.position.y)
      sprite.scale.set(island.size / config.islandTextureSize)
      sprite.rotation = island.rotation
      this.container.addChild(sprite)
      return sprite
    })
    this.playerTextures = fleet.player
    this.playerSprite = new Sprite(this.playerTextures[0]!)
    this.playerSprite.anchor.set(0.5)
    this.playerSprite.scale.set(config.playerSpriteScale)
    this.container.addChild(this.playerSprite)
    this.container.addChild(this.combatView.container)
    this.container.addChild(this.damageView.container)
    this.container.addChild(this.healthView.container)
    this.debugGraphics = new Graphics()
    this.debugGraphics.visible = this.debugColliders
    this.container.addChild(this.debugGraphics)
    app.stage.addChild(this.container)
  }

  render(world: World, camera: Camera, width: number, height: number) {
    this.viewport = { x: camera.position.x, y: camera.position.y, width, height }
    if (this.ocean) {
      this.ocean.position.set(camera.position.x, camera.position.y)
      this.ocean.width = width
      this.ocean.height = height
      this.ocean.tilePosition.set(-camera.position.x, -camera.position.y)
    }
    this.container.position.set(-camera.position.x, -camera.position.y)
    if (this.playerSprite) {
      this.playerSprite.visible = world.player.alive
      this.playerSprite.texture = this.playerTextures[damageStage(world.player.hp, world.player.maxHp)]!
      this.playerSprite.position.set(world.player.position.x, world.player.position.y)
      // ship_1's pointed bow faces down at rotation 0; logical heading 0 is north.
      this.playerSprite.rotation = world.player.rotation + config.spriteRotationOffset
    }
    world.islands.forEach((island, index) => {
      const radius = island.boundingRadius * 1.15
      this.islandSprites[index]!.visible = island.position.x + radius >= camera.position.x
        && island.position.x - radius <= camera.position.x + width
        && island.position.y + radius >= camera.position.y
        && island.position.y - radius <= camera.position.y + height
    })
    this.combatView.render(world, 0, this.viewport)
    this.damageView.render(world, this.viewport)
    this.healthView.render(world, camera, width, height)
    if (this.debugColliders && this.debugGraphics) {
      this.debugGraphics.clear()
      world.islands.forEach((island, index) => {
        if (!this.islandSprites[index]!.visible) return
        for (const collider of navigationClearance(island).slice(island.colliders.length)) {
          if (collider.type === 'polygon') this.debugGraphics!.poly(collider.vertices.flatMap(p => [p.x, p.y]))
          this.debugGraphics!.stroke({ color: 0x42e8ad, width: 2 })
        }
        for (const collider of island.colliders) {
          if (collider.type === 'polygon') {
            this.debugGraphics!.poly(collider.vertices.flatMap((p) => [p.x, p.y]))
          } else {
            this.debugGraphics!.circle(collider.position.x, collider.position.y, collider.radius)
          }
          this.debugGraphics!.stroke({ color: 0xff3d7f, width: 2 })
        }
      })
      for (const circle of world.player.alive ? world.player.colliders : []) {
        this.debugGraphics.circle(circle.position.x, circle.position.y, circle.radius)
          .stroke({ color: 0xffff00, width: 2 })
      }
      for (const area of world.patrolAreas) {
        this.debugGraphics.rect(area.x, area.y, area.width, area.height)
          .stroke({ color: 0x9d7bff, width: 2, alpha: 0.8 })
      }
      for (const enemy of world.enemies) {
        if (!enemy.alive) continue
        const color = enemy.type === 'chaser' ? 0xff6947 : 0x66ddff
        this.debugGraphics.circle(enemy.patrol.center.x, enemy.patrol.center.y, enemy.patrol.radius)
          .stroke({ color, width: 1, alpha: 0.35 })
        for (const radius of [enemy.patrol.radius - ROUTE_MARGIN, enemy.patrol.radius + ROUTE_MARGIN])
          this.debugGraphics.circle(enemy.patrol.center.x, enemy.patrol.center.y, radius)
            .stroke({ color, width: 1, alpha: 0.2 })
        this.debugGraphics.moveTo(enemy.position.x, enemy.position.y)
          .lineTo(enemy.position.x + Math.sin(enemy.rotation) * COMBAT_CONFIG.patrol.hullLookAhead,
            enemy.position.y - Math.cos(enemy.rotation) * COMBAT_CONFIG.patrol.hullLookAhead)
          .stroke({ color: 0xffffff, width: 2 })
        if (enemy.navigation.waypoint) this.debugGraphics.moveTo(enemy.position.x, enemy.position.y)
          .lineTo(enemy.navigation.waypoint.x, enemy.navigation.waypoint.y).stroke({ color: 0x42e8ad, width: 2 })
        const area = world.patrolAreas.find((item) => item.id === enemy.areaId)
        if (area) {
          const leash = leashBounds(area)
          this.debugGraphics.rect(leash.x, leash.y, leash.width, leash.height)
            .stroke({ color, width: 2, alpha: 0.4 })
        }
        for (const circle of enemy.colliders) {
          this.debugGraphics.circle(circle.position.x, circle.position.y, circle.radius)
            .stroke({ color, width: 2 })
        }
        this.debugGraphics.circle(enemy.position.x, enemy.position.y, enemy.visionRange)
          .stroke({ color, width: 1, alpha: 0.5 })
        if (enemy.type === 'shooter') {
          this.debugGraphics.circle(enemy.position.x, enemy.position.y, enemy.attackRange)
            .stroke({ color: 0xffd166, width: 1, alpha: 0.7 })
        }
      }
      for (const projectile of world.projectiles) {
        const circle = projectile.collider
        this.debugGraphics.circle(circle.position.x, circle.position.y, circle.radius)
          .stroke({ color: projectile.team === 'player' ? 0xffffff : 0xff4444, width: 1 })
      }
    }
  }

  destroy() {
    if (this.disposed) return
    this.disposed = true
    this.combatView.destroy()
    this.healthView.destroy()
    this.damageView.destroy()
    this.container.destroy({ children: true })
    this.generatedTextures.forEach((texture) => texture.destroy(true))
    this.surfaceTextures.forEach((texture) => texture.destroy(true))
    this.generatedTextures = []
    this.surfaceTextures = []
    // Assets.load textures stay in the shared Pixi cache across React mounts.
  }

  renderEnding(world: World, dt: number) {
    this.endingAge += dt
    if (this.playerSprite) this.playerSprite.visible = world.player.alive
    this.damageView.render(world, this.viewport)
    this.combatView.render(world, this.endingAge, this.viewport)
  }
}
