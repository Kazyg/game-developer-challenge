import type { Vector2 } from '../entities/Island'

export interface Viewport { x: number; y: number; width: number; height: number }

export function inViewport(position: Vector2, radius: number, view?: Viewport): boolean {
  return !view || (position.x + radius >= view.x && position.x - radius <= view.x + view.width
    && position.y + radius >= view.y && position.y - radius <= view.y + view.height)
}
