import type { CircleCollider, Collider, PolygonCollider, Vector2 } from '../entities/Island'

type Circle = Pick<CircleCollider, 'position' | 'radius'>

// Terrain polygons are immutable: cache their broad-phase bounds once.
const polygonBounds = new WeakMap<PolygonCollider, { left: number; right: number; top: number; bottom: number }>()
function bounds(polygon: PolygonCollider) {
  let result = polygonBounds.get(polygon)
  if (!result) {
    result = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity }
    for (const vertex of polygon.vertices) {
      result.left = Math.min(result.left, vertex.x); result.right = Math.max(result.right, vertex.x)
      result.top = Math.min(result.top, vertex.y); result.bottom = Math.max(result.bottom, vertex.y)
    }
    polygonBounds.set(polygon, result)
  }
  return result
}

// Entry time of a moving circle, normalized to the valid segment [0, 1].
export function sweepCircle(start: Vector2, end: Vector2, radius: number, target: Circle): number | null {
  const x = start.x - target.position.x, y = start.y - target.position.y
  const dx = end.x - start.x, dy = end.y - start.y
  const r = radius + target.radius
  const c = x * x + y * y - r * r
  if (c <= 0) return 0
  const a = dx * dx + dy * dy
  if (a === 0) return null
  const b = x * dx + y * dy
  const discriminant = b * b - a * c
  if (discriminant < 0) return null
  const t = (-b - Math.sqrt(discriminant)) / a
  return t >= 0 && t <= 1 ? t : null
}

export function sweepCollider(start: Vector2, end: Vector2, radius: number, collider: Collider): number | null {
  if (collider.type === 'circle') return sweepCircle(start, end, radius, collider)
  const box = bounds(collider)
  if (Math.max(start.x, end.x) + radius < box.left || Math.min(start.x, end.x) - radius > box.right
    || Math.max(start.y, end.y) + radius < box.top || Math.min(start.y, end.y) - radius > box.bottom) return null
  if (circleOverlapsPolygon({ position: start, radius }, collider)) return 0
  let first: number | null = null
  const accept = (t: number | null) => { if (t !== null && (first === null || t < first)) first = t }
  for (let i = 0; i < collider.vertices.length; i++) {
    const a = collider.vertices[i]!, b = collider.vertices[(i + 1) % collider.vertices.length]!
    accept(sweepCircle(start, end, radius, { position: a, radius: 0 }))
    const ex = b.x - a.x, ey = b.y - a.y, length = Math.hypot(ex, ey)
    if (length === 0) continue
    const nx = -ey / length, ny = ex / length
    const offset = (start.x - a.x) * nx + (start.y - a.y) * ny
    const velocity = (end.x - start.x) * nx + (end.y - start.y) * ny
    if (velocity === 0) continue
    for (const side of [-radius, radius]) {
      const t = (side - offset) / velocity
      if (t < 0 || t > 1) continue
      const along = ((start.x + (end.x - start.x) * t - a.x) * ex
        + (start.y + (end.y - start.y) * t - a.y) * ey) / (length * length)
      if (along >= 0 && along <= 1) accept(t)
    }
  }
  return first
}

export function circlesOverlap(a: Circle, b: Circle): boolean {
  const dx = a.position.x - b.position.x, dy = a.position.y - b.position.y
  return dx * dx + dy * dy < (a.radius + b.radius) ** 2
}

export function pointInPolygon(point: Vector2, vertices: readonly Vector2[]): boolean {
  let inside = false
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const a = vertices[i]!
    const b = vertices[j]!
    if ((a.y > point.y) !== (b.y > point.y)
      && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

function distanceToSegmentSquared(point: Vector2, a: Vector2, b: Vector2): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy
  const t = lengthSquared === 0 ? 0
    : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared))
  return (point.x - a.x - t * dx) ** 2 + (point.y - a.y - t * dy) ** 2
}

export function circleOverlapsPolygon(circle: Circle, polygon: PolygonCollider): boolean {
  const box = bounds(polygon)
  if (circle.position.x + circle.radius < box.left || circle.position.x - circle.radius > box.right
    || circle.position.y + circle.radius < box.top || circle.position.y - circle.radius > box.bottom) return false
  if (pointInPolygon(circle.position, polygon.vertices)) return true
  return polygon.vertices.some((a, index) => {
    const b = polygon.vertices[(index + 1) % polygon.vertices.length]!
    return distanceToSegmentSquared(circle.position, a, b) < circle.radius ** 2
  })
}

export function overlapsCollider(circle: Circle, collider: Collider): boolean {
  return collider.type === 'circle' ? circlesOverlap(circle, collider) : circleOverlapsPolygon(circle, collider)
}

export function canOccupy(position: Vector2, radius: number, obstacles: readonly Collider[],
  width: number, height: number): boolean {
  return position.x >= radius && position.y >= radius
    && position.x <= width - radius && position.y <= height - radius
    && !obstacles.some((collider) => overlapsCollider({ position, radius }, collider))
}

export function canOccupyWithCircles(circles: readonly CircleCollider[], obstacles: readonly Collider[],
  width: number, height: number): boolean {
  return circles.every((circle) => canOccupy(circle.position, circle.radius, obstacles, width, height))
}
