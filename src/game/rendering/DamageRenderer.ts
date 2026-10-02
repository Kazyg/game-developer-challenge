import { Assets, Container, Sprite } from 'pixi.js'
import type { Texture } from 'pixi.js'
import { GAME_CONFIG } from '../config/GameConfig'
import type { World } from '../world/World'
import { inViewport } from './Viewport'
import type { Viewport } from './Viewport'
import fireUrl from '../../../assets/png/retina/effects/fire_2.png'

export class DamageRenderer {
  readonly container = new Container()
  private readonly overlays = new Map<string, Container>()
  private parts: Texture[] = []
  private texture: Texture | undefined
  private disposed = false
  async initialize() {
    const partUrls = import.meta.glob('../../../assets/png/default/ship_parts/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
    const parts = await Promise.all(['cannon', 'flag_1', 'flag_3', 'flag_5'].map(name => Assets.load<Texture>(partUrls[`../../../assets/png/default/ship_parts/${name}.png`]!)))
    if (!this.disposed) this.parts = parts
    const texture = await Assets.load<Texture>(fireUrl)
    if (!this.disposed) this.texture = texture
  }
  render(world: World, viewport?: Viewport) {
    const damaged = [world.player, ...world.enemies].filter(ship => ship.alive)
    const ids = new Set(damaged.map(ship => ship.id))
    for (const [id, overlay] of this.overlays) {
      if (!ids.has(id)) { overlay.destroy({ children: true }); this.overlays.delete(id) }
    }
    for (const ship of damaged) {
      let overlay = this.overlays.get(ship.id)
      const visible = inViewport(ship.position, 80, viewport)
      if (overlay) overlay.visible = visible
      if (!visible) continue
      if (!overlay) {
        overlay = new Container()
        // Identity flag remains independent of damage stage.
        const flag = new Sprite(this.parts[ship.team === 'player' ? 1 : ship.type === 'chaser' ? 2 : 3]!)
        flag.anchor.set(0.5)
        flag.position.set(0, -37)
        overlay.addChild(flag)
        if (ship.team === 'player' || ship.type === 'shooter') {
          for (const [x, y, rotation] of [[0, 42, Math.PI / 2], [-17, 0, Math.PI], [17, 0, 0]]) {
            const cannon = new Sprite(this.parts[0]!)
            cannon.anchor.set(0.5)
            cannon.position.set(x, y)
            cannon.rotation = rotation
            cannon.scale.set(0.65)
            overlay.addChild(cannon)
          }
        }
        for (const x of [-5, 5]) {
          const fire = new Sprite(this.texture!)
          fire.anchor.set(0.5, 1)
          fire.position.set(x, 5)
          fire.scale.set(0.6)
          overlay.addChild(fire)
        }
        this.container.addChild(overlay)
        this.overlays.set(ship.id, overlay)
      }
      overlay.position.set(ship.position.x, ship.position.y)
      overlay.rotation = ship.rotation + GAME_CONFIG.spriteRotationOffset
      overlay.scale.set(GAME_CONFIG.playerSpriteScale)
      const ratio = ship.hp / ship.maxHp
      overlay.children.at(-2)!.visible = ratio <= 0.6
      overlay.children.at(-1)!.visible = ratio <= 0.3
      overlay.alpha = 1
    }
  }
  destroy() {
    if (this.disposed) return
    this.disposed = true
    this.container.destroy({ children: true })
    this.overlays.clear()
  }
}
