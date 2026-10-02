import type { IslandShape } from '../world/IslandShapes'
import type { IslandSizeCategory } from '../world/IslandSizes'

export interface Vector2 {
  x: number
  y: number
}

export interface CircleCollider {
  type: 'circle'
  position: Vector2
  radius: number
}

export interface PolygonCollider {
  type: 'polygon'
  vertices: readonly Vector2[]
}

export type Collider = CircleCollider | PolygonCollider

export interface Island {
  id: string
  position: Vector2
  size: number
  sizeCategory?: IslandSizeCategory
  shape?: IslandShape
  variant: number
  rotation: number
  boundingRadius: number
  colliders: Collider[]
}
