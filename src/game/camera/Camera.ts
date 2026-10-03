import type { Vector2 } from '../entities/Island'

export class Camera {
  zoom = 1
  screenToWorld(point: Vector2): Vector2 {
    return { x: this.position.x + point.x / this.zoom, y: this.position.y + point.y / this.zoom }
  }
  worldToScreen(point: Vector2): Vector2 {
    return { x: (point.x - this.position.x) * this.zoom, y: (point.y - this.position.y) * this.zoom }
  }

  readonly position: Vector2 = { x: 0, y: 0 }

  follow(target: Vector2, viewportWidth: number, viewportHeight: number, worldWidth: number, worldHeight: number) {
    this.position.x = Math.max(0, Math.min(target.x - viewportWidth / 2, worldWidth - viewportWidth))
    this.position.y = Math.max(0, Math.min(target.y - viewportHeight / 2, worldHeight - viewportHeight))
  }
}
