import { Assets, Container, Graphics, Sprite } from 'pixi.js'
import type { Texture } from 'pixi.js'
import { GAME_CONFIG } from '../config/GameConfig'
import type { World } from '../world/World'
import type { Camera } from '../camera/Camera'
import { inViewport } from './Viewport'
import playerFrame from '../../../assets/png/retina/ui/hud/health_frame.png'
import playerFill from '../../../assets/png/retina/ui/hud/health_fill_green.png'
import enemyFrame from '../../../assets/png/retina/ui/hud/enemy_health_frame.png'
import enemyFill from '../../../assets/png/retina/ui/hud/enemy_health_fill_red.png'

interface HealthBar { container: Container; mask: Graphics; width: number; height: number; inset: number; ratio?: number }
export class HealthBarRenderer {
  readonly container = new Container()
  private readonly bars = new Map<string, HealthBar>()
  private textures: Texture[] = []
  private disposed = false

  async initialize() {
    const textures = await Promise.all([playerFrame, playerFill, enemyFrame, enemyFill].map(url => Assets.load<Texture>(url)))
    if (!this.disposed) this.textures = textures
  }

  render(world: World, camera: Camera, width: number, height: number) {
    const ships = [world.player, ...world.enemies].filter(ship => ship.alive)
    const ids = new Set(ships.map(ship => ship.id))
    for (const [id, bar] of this.bars) {
      if (!ids.has(id)) { bar.container.destroy({ children: true }); this.bars.delete(id) }
    }
    for (const ship of ships) {
      let bar = this.bars.get(ship.id)
      const visible = inViewport(ship.position, 80, { x: camera.position.x, y: camera.position.y, width, height })
      if (bar) bar.container.visible = visible
      if (!visible) continue
      if (!bar) {
        const player = ship.team === 'player'
        const frame = new Sprite(this.textures[player ? 0 : 2]!)
        const fill = new Sprite(this.textures[player ? 1 : 3]!)
        const container = new Container()
        const mask = new Graphics()
        fill.mask = mask
        container.addChild(frame, fill, mask)
        const barWidth = player ? 64 : 48
        container.scale.set(barWidth / frame.texture.width)
        bar = { container, mask, width: frame.texture.width, height: frame.texture.height,
          inset: player ? 60 : 48 }
        this.container.addChild(container)
        this.bars.set(ship.id, bar)
      }
      const ratio = Math.max(0, Math.min(1, ship.hp / ship.maxHp))
      if (bar.ratio !== ratio) {
        bar.mask.clear().rect(bar.inset, 0, (bar.width - 2 * bar.inset) * ratio, bar.height).fill(0xffffff)
        bar.ratio = ratio
      }
      const displayWidth = bar.width * bar.container.scale.x
      bar.container.position.set(ship.position.x - displayWidth / 2, ship.position.y - 84 * GAME_CONFIG.playerSpriteScale)
      bar.container.visible = true
    }
  }

  destroy() {
    if (this.disposed) return
    this.disposed = true
    this.container.destroy({ children: true })
    this.bars.clear()
  }
}
