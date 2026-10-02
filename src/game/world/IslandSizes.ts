export type IslandSizeCategory = 'SMALL' | 'MEDIUM' | 'LARGE' | 'HUGE'

export const ISLAND_SIZE_PROFILES = {
  SMALL: { min: 200, max: 260, weight: 0.40, coastlinePoints: 32, roughness: 0.025, maxInterests: 1, fortTileSize: 30, decorationSpacing: 46 },
  MEDIUM: { min: 300, max: 365, weight: 0.38, coastlinePoints: 48, roughness: 0.04, maxInterests: 2, fortTileSize: 42, decorationSpacing: 42 },
  LARGE: { min: 470, max: 590, weight: 0.18, coastlinePoints: 72, roughness: 0.07, maxInterests: 3, fortTileSize: 48, decorationSpacing: 38 },
  HUGE: { min: 680, max: 860, weight: 0.04, coastlinePoints: 96, roughness: 0.105, maxInterests: 5, fortTileSize: 54, decorationSpacing: 36 },
} as const

export function islandSizeCategory(size: number): IslandSizeCategory {
  if (size < 280) return 'SMALL'
  if (size < 420) return 'MEDIUM'
  return size < 640 ? 'LARGE' : 'HUGE'
}
