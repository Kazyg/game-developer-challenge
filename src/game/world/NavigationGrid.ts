import { canOccupy, sweepCollider } from '../collision/CollisionSystem'
import type { Collider, Vector2 } from '../entities/Island'

/** Fixed terrain grid shared by all routes in one seeded world. Nodes and swept
 * links are cached independently of moving ships and player positions. */
export class NavigationGrid {
  readonly columns: number
  readonly rows: number
  readonly stepX: number
  readonly stepY: number
  readonly length: number
  private readonly occupancy: Uint8Array
  private readonly links = new Map<number, readonly number[]>()
  private readonly components: Int32Array
  private readonly members = new Map<number, number[]>()
  private componentSequence = 0

  readonly colliders: readonly Collider[]
  readonly width: number
  readonly height: number
  readonly radius: number
  private readonly cardinalOnly: boolean
  constructor(colliders: readonly Collider[], width: number,
    height: number, cell: number, radius: number, cardinalOnly = false) {
    this.colliders = colliders; this.width = width; this.height = height
    this.radius = radius; this.cardinalOnly = cardinalOnly
    this.columns = Math.floor(width / cell); this.rows = Math.floor(height / cell)
    this.stepX = width / this.columns; this.stepY = height / this.rows
    this.length = this.columns * this.rows
    this.occupancy = new Uint8Array(this.length)
    this.components = new Int32Array(this.length)
  }

  point(index: number): Vector2 {
    return { x: (index % this.columns + 0.5) * this.stepX,
      y: (Math.floor(index / this.columns) + 0.5) * this.stepY }
  }

  safe(point: Vector2): boolean {
    return canOccupy(point, this.radius, this.colliders, this.width, this.height)
  }

  clear(a: Vector2, b: Vector2): boolean {
    return this.safe(a) && this.safe(b)
      && !this.colliders.some(collider => sweepCollider(a, b, this.radius, collider) !== null)
  }

  free(index: number): boolean {
    if (index < 0 || index >= this.length) return false
    if (!this.occupancy[index]) this.occupancy[index] = this.safe(this.point(index)) ? 1 : 2
    return this.occupancy[index] === 1
  }

  neighbors(index: number): readonly number[] {
    const cached = this.links.get(index)
    if (cached) return cached
    const result: number[] = [], x = index % this.columns, y = Math.floor(index / this.columns)
    const cardinal = [[0, -1], [0, 1], [-1, 0], [1, 0]] as const
    const directions = this.cardinalOnly ? cardinal : [...cardinal, [-1, -1], [1, -1], [-1, 1], [1, 1]] as const
    for (const [dx, dy] of directions) {
      if (x + dx < 0 || x + dx >= this.columns || y + dy < 0 || y + dy >= this.rows) continue
      const next = (y + dy) * this.columns + x + dx
      if (!this.free(next)) continue
      // Do not cut diagonally across blocked cardinal corners.
      if (dx && dy && (!this.free(y * this.columns + x + dx) || !this.free((y + dy) * this.columns + x))) continue
      if (this.clear(this.point(index), this.point(next))) result.push(next)
    }
    this.links.set(index, result)
    return result
  }

  near(point: Vector2, radius: number): number[] {
    const result: number[] = []
    const minX = Math.max(0, Math.floor((point.x - radius) / this.stepX))
    const maxX = Math.min(this.columns - 1, Math.floor((point.x + radius) / this.stepX))
    const minY = Math.max(0, Math.floor((point.y - radius) / this.stepY))
    const maxY = Math.min(this.rows - 1, Math.floor((point.y + radius) / this.stepY))
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const index = y * this.columns + x
      if (this.free(index) && Math.hypot(this.point(index).x - point.x, this.point(index).y - point.y) <= radius) result.push(index)
    }
    return result
  }

  /** Exhaustive connectivity search, cached once per water component. A failed
   * local visibility test is never used to declare the destination unreachable. */
  component(start: number): readonly number[] {
    const existing = this.components[start]!
    if (existing) return this.members.get(existing)!
    const id = ++this.componentSequence, queue = [start]
    this.components[start] = id
    for (let head = 0; head < queue.length; head++) for (const next of this.neighbors(queue[head]!)) {
      if (this.components[next]) continue
      this.components[next] = id; queue.push(next)
    }
    this.members.set(id, queue)
    return queue
  }

  sameComponent(a: number, b: number): boolean {
    this.component(a)
    return this.components[a] === this.components[b]
  }
}
