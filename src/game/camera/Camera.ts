import type { Vector2 } from '../entities/Island'

export class Camera {
  readonly position: Vector2 = { x: 0, y: 0 }

  follow(target: Vector2, viewportWidth: number, viewportHeight: number, worldWidth: number, worldHeight: number) {
    this.position.x = Math.max(0, Math.min(target.x - viewportWidth / 2, worldWidth - viewportWidth))
    this.position.y = Math.max(0, Math.min(target.y - viewportHeight / 2, worldHeight - viewportHeight))
  }
}
