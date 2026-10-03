import { Application, Assets } from 'pixi.js'
import type { Texture } from 'pixi.js'
import { World } from '../game/world/World'
import { WorldRenderer } from '../game/rendering/WorldRenderer'
import sandUrl from '../../assets/png/default/tiles/tile_68.png'

export async function verifyTextureOwnershipFailure() {
  if (!import.meta.env.DEV) throw new Error('Test instrumentation is only available in development.')
  const app = new Application()
  await app.init({ width: 320, height: 240, autoStart: false })
  const world = new World(42, { combatEnabled: false })
  const renderer = new WorldRenderer()
  const generate = app.renderer.generateTexture.bind(app.renderer)
  const local: Texture[] = []
  let failed = false
  app.renderer.generateTexture = options => {
    if (local.length === 2) throw new Error('Injected island composition failure')
    const texture = generate(options)
    local.push(texture)
    return texture
  }
  try { await renderer.initialize(app, world) }
  catch { failed = true }
  renderer.destroy()
  renderer.destroy()
  const released = local.length === 2 && local.every(texture => texture.destroyed)
  const sharedAlive = !Assets.get<Texture>(sandUrl).destroyed
  const orphanCount = renderer.observe().localTextures
  app.renderer.generateTexture = generate
  const replacement = new WorldRenderer()
  try {
    await replacement.initialize(app, world)
    return { failed, released, sharedAlive, orphanCount, recovered: replacement.observe().localTextures > 2 }
  } finally {
    replacement.destroy()
    app.destroy(false, { children: true })
  }
}
