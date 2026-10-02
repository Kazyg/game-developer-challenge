export type ShipKind = 'player' | 'chaser' | 'shooter'
export const SHIP_SEQUENCES = {
  player: [1, 7, 13, 19], chaser: [3, 9, 15, 21], shooter: [5, 11, 17, 23],
} as const
export function damageStage(hp: number, maxHp: number): 0 | 1 | 2 | 3 {
  if (hp <= 0) return 3
  const ratio = hp / maxHp
  return ratio > 0.6 ? 0 : ratio > 0.3 ? 1 : 2
}
export function shipAssetIndex(kind: ShipKind, hp: number, maxHp: number) {
  return SHIP_SEQUENCES[kind][damageStage(hp, maxHp)]
}
