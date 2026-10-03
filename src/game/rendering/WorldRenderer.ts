import { Assets, Container, Graphics, Rectangle, Sprite, Texture, TilingSprite } from 'pixi.js'
import type { Application } from 'pixi.js'
import { GAME_CONFIG as config } from '../config/GameConfig'
import type { Camera } from '../camera/Camera'
import type { World } from '../world/World'
import { getIslandShape } from '../world/IslandShapes'
import type { IslandShape } from '../world/IslandShapes'
import { initializeAssets } from './initializeAssets'
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
import { DebugRenderer } from './DebugRenderer'
import type { Viewport } from './Viewport'

export class WorldRenderer {
  readonly container = new Container()
  private playerTextures: Texture[] = []
  private playerSprite: Sprite | undefined
  private islandSprites: Sprite[] = []
  private generatedTextures: Texture[] = []
  private surfaceTextures: Texture[] = []
  private readonly debugView = new DebugRenderer()
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
    this.debugView.graphics.visible = this.debugColliders
  }

  observe() {
    return { debug: this.debugView.graphics.visible,
      debugInstructions: this.debugView.graphics.context?.instructions.length ?? 0,
      localTextures: this.generatedTextures.length + this.surfaceTextures.length,
      ocean: this.ocean ? { width: this.ocean.width, height: this.ocean.height } : undefined,
      combat: this.combatView.observe(), damage: this.damageView.observe(), health: this.healthView.observe() }
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
    try { return app.renderer.generateTexture(composition) }
    finally { composition.destroy({ children: true }) }
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
      const detail = details.get(decoration.tile)
      if (!detail) throw new Error(`Missing island tile ${decoration.tile}`)
      const sprite = new Sprite(detail)
      sprite.anchor.set(0.5)
      sprite.position.set(decoration.position.x * config.islandTextureSize, decoration.position.y * config.islandTextureSize)
      sprite.scale.set(decoration.scale)
      sprite.rotation = decoration.rotation
      composition.addChild(sprite)
    }
    try {
      return app.renderer.generateTexture({
        target: composition,
        frame: new Rectangle(-radius, -radius, radius * 2, radius * 2),
      })
    } finally { composition.destroy({ children: true }) }
  }

  async initialize(app: Application, world: World): Promise<void> {
    const fleetTask = loadShipTextures()
    const [fleet, oceanTexture, sand, grass, details, shallow] = await initializeAssets([
      fleetTask,
      Assets.load<Texture>(oceanUrl),
      Assets.load<Texture>(sandUrl), Assets.load<Texture>(grassUrl),
      initializeAssets([...new Set([49, 51, 70, 72, 87, 88, ...STRUCTURE_TILE_IDS])].map(async index => {
        const url = index >= 81 && index <= 84
          ? new URL(`../../../assets/generated/cutouts/tile_${index}.png`, import.meta.url).href
          : new URL(`../../../assets/png/default/tiles/tile_${index}.png`, import.meta.url).href
        return [index, await Assets.load<Texture>(url)] as const
      })),
      Assets.load<Texture>(new URL('../../../assets/png/retina/tiles/tile_27.png', import.meta.url).href),
      this.combatView.initialize(fleetTask),
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
    const sandSurface = this.createSeamlessTexture(app, sand)
    this.surfaceTextures.push(sandSurface)
    const grassSurface = this.createSeamlessTexture(app, grass)
    this.surfaceTextures.push(grassSurface)
    const detailTextures = new Map(details)
    // Store each owned texture immediately, so a later generation error cannot
    // strand textures created earlier in a map/argument expression.
    world.islands.forEach((island, index) => {
      this.generatedTextures.push(this.createIslandTexture(app, getIslandShape(island),
        sandSurface, grassSurface, detailTextures, shallow, world.seed ^ ((index + 1) * 0x45d9f3b), island.size))
    })
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
    this.debugView.graphics.visible = this.debugColliders
    this.container.addChild(this.debugView.graphics)
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
    this.container.scale.set(camera.zoom)
    this.container.position.set(-camera.position.x * camera.zoom, -camera.position.y * camera.zoom)
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
    if (this.debugColliders) this.debugView.render(world, this.islandSprites.map(sprite => sprite.visible))
  }

  destroy() {
    if (this.disposed) return
    this.disposed = true
    this.combatView.destroy()
    this.healthView.destroy()
    this.damageView.destroy()
    if (!this.debugView.graphics.parent) this.debugView.graphics.destroy()
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
