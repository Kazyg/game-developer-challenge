import { Assets } from 'pixi.js'
import type { Texture } from 'pixi.js'
import { SHIP_SEQUENCES } from './ShipAppearance'
import type { ShipKind } from './ShipAppearance'
const urls = import.meta.glob('../../../assets/png/default/ships/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
export async function loadShipTextures(): Promise<Record<ShipKind, Texture[]>> {
  const groups = await Promise.all((['player', 'chaser', 'shooter'] as const).map(async kind =>
    [kind, await Promise.all(SHIP_SEQUENCES[kind].map(index => Assets.load<Texture>(urls[`../../../assets/png/default/ships/ship_${index}.png`]!)))] as const))
  return Object.fromEntries(groups) as Record<ShipKind, Texture[]>
}
