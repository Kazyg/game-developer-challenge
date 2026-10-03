import type { Container } from 'pixi.js'

export function removeMissing<T>(cache: Map<string, T>, ids: ReadonlySet<string>, dispose: (item: T) => void) {
  for (const [id, item] of cache) {
    if (ids.has(id)) continue
    dispose(item)
    cache.delete(id)
  }
}
export function destroyDisplay(item: Container) { item.destroy({ children: true }) }
