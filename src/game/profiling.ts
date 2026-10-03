import { Game } from './Game'
import { Application, Assets, Sprite, Container, Texture, Ticker, RendererType } from 'pixi.js'
import { WorldRenderer } from './rendering/WorldRenderer'
import { GAME_CONFIG } from './config/GameConfig'
import { COMBAT_CONFIG } from './config/CombatConfig'
import { CombatRenderer } from './rendering/CombatRenderer'
import { DamageRenderer } from './rendering/DamageRenderer'
import { HealthBarRenderer } from './rendering/HealthBarRenderer'
import { NavigationGrid } from './world/NavigationGrid'

type Internals = { app: Application; view: WorldRenderer; simulationClock: { accumulator: number } }

// Opt-in observation for the optimized-build benchmark; never changes game rules.
export function installProfiling() {
  let current: (() => Game) | undefined
  let steps = 0, renders = 0, simulationMs = 0, rendererMs = 0
  let frames: object[] = [], samples: object[] = [], previous: number | undefined
  let recording = false, lastSample = -1
  let startupMs = 0
  let terminal: ReturnType<typeof state> = null
  let events: Record<string, number> = {}
  let pauses: { startWallMs: number; endWallMs?: number; gameTime: number; visibility: string; focused: boolean }[] = []
  const detail: Record<string, { calls: number; ms: number }> = {}
  const detailed = new URLSearchParams(location.search).get('detail') === '1'
  const wrap = (target: object, key: string, label: string, time = true) => {
    const methods = target as Record<string, (...args: unknown[]) => unknown>
    const original = methods[key]
    if (typeof original !== 'function') return
    methods[key] = function (...args) {
      const start = time ? performance.now() : 0
      try { return original.apply(this, args) }
      finally {
        const value = detail[label] ??= { calls: 0, ms: 0 }
        value.calls++; if (time) value.ms += performance.now() - start
      }
    }
  }
  if (detailed) {
    for (const [prototype, label] of [[WorldRenderer.prototype, 'worldView'], [CombatRenderer.prototype, 'combatView'],
      [DamageRenderer.prototype, 'damageView'], [HealthBarRenderer.prototype, 'healthView']] as const) wrap(prototype, 'render', label)
    for (const method of ['component', 'near']) wrap(NavigationGrid.prototype, method, `navigation.${method}`)
  }
  const counters = () => ({ steps, renders, simulationMs, rendererMs })
  let prior = counters()
  const state = (details = true) => {
    if (!current) return null
    const game = current(), world = game.world
    const internals = game as unknown as Internals
    return { seed: world.seed, time: world.time, paused: world.paused, gameOver: world.gameOver,
      hp: world.player.hp, score: world.score, islands: world.islands.length,
      ships: world.enemies.length + Number(world.player.alive), projectiles: world.projectiles.length,
      effects: world.effects.length, wrecks: world.wrecks.length,
      chasers: world.enemies.filter(e => e.type === 'chaser').length,
      shooters: world.enemies.filter(e => e.type === 'shooter').length,
      engaged: world.enemies.filter(e => ['CHASE', 'APPROACH', 'ATTACK'].includes(e.state)).length,
      player: { ...world.player.position, rotation: world.player.rotation },
      enemies: details ? world.enemies.map(e => ({ ...e.position, type: e.type })) : undefined,
      navigation: details ? world.enemies.map(e => ({ id: e.id, plans: e.navigation.planCount,
        routePoints: e.navigation.route.length, state: e.state })) : undefined,
      backlogSeconds: internals.simulationClock.accumulator,
      visible: document.visibilityState, focused: document.hasFocus() }
  }
  const observeFrame = (now: number) => {
    const value = recording ? state(false) : null
    if (value && !value.paused && !value.gameOver) {
      const next = counters()
      if (previous !== undefined) frames.push({ wallMs: now, intervalMs: now - previous,
        steps: next.steps - prior.steps, renders: next.renders - prior.renders,
        simulationMs: next.simulationMs - prior.simulationMs, rendererMs: next.rendererMs - prior.rendererMs,
        backlogSeconds: value.backlogSeconds, time: value.time })
      previous = now; prior = next
      if (Math.floor(value.time) !== lastSample) {
        lastSample = Math.floor(value.time)
        const game = current!(), app = (game as unknown as Internals).app
        let containers = 0, sprites = 0, visibleObjects = 0
        const visit = (node: Application['stage']) => {
          containers++; if (node instanceof Sprite) sprites++
          if (node.visible) visibleObjects++
          for (const child of node.children) visit(child)
        }
        visit(app.stage)
        samples.push({ wallMs: now, ...state(), resources: { containers, sprites, visibleObjects,
          sharedCacheKeys: (Assets.cache as unknown as { _cache: Map<string, unknown> })._cache.size,
          view: (game as unknown as Internals).view.observe() } })
      }
    } else { previous = undefined; prior = counters() }
    requestAnimationFrame(observeFrame)
  }
  requestAnimationFrame(observeFrame)
  const start = Game.prototype.start
  const destroy = Game.prototype.destroy
  const pause = Game.prototype.pause
  const resume = Game.prototype.resume
  Game.prototype.pause = function () {
    if (recording && current?.() === this && !this.world.paused && !this.world.gameOver) {
      pauses.push({ startWallMs: performance.now(), gameTime: this.world.time,
        visibility: document.visibilityState, focused: document.hasFocus() })
    }
    pause.call(this)
  }
  Game.prototype.resume = function () {
    if (recording && current?.() === this && pauses.at(-1)?.endWallMs === undefined && pauses.length)
      pauses[pauses.length - 1].endWallMs = performance.now()
    resume.call(this)
  }
  Game.prototype.start = async function (host) {
    const begun = performance.now()
    await start.call(this, host)
    startupMs = performance.now() - begun
    if (host.querySelector('canvas')) {
      terminal = null
      events = {}
      current = () => this
      const app = (this as unknown as Internals).app
      if (detailed) {
        for (const method of ['canEnemyPose', 'canPlayerPose']) wrap(this.world, method, method)
        wrap(this, 'publishHud', 'hudPublish')
        const gl = (app.renderer as unknown as { gl?: WebGL2RenderingContext }).gl
        if (gl) for (const method of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'bindTexture']) wrap(gl, method, `gl.${method}`, false)
      }
      const update = this.world.update.bind(this.world)
      const emit = this.world.emit
      this.world.emit = event => { events[event.type] = (events[event.type] ?? 0) + 1; emit(event) }
      this.world.update = (...args) => {
        const begun = performance.now()
        try { return update(...args) } finally { steps++; simulationMs += performance.now() - begun }
      }
      const renderer = app.renderer as unknown as { render: (...args: unknown[]) => void }
      const render = renderer.render.bind(renderer)
      renderer.render = (...args: unknown[]) => {
        const begun = performance.now()
        try { return render(...args) } finally { renders++; rendererMs += performance.now() - begun }
      }
      Object.assign(window, { __combatProfileEnvironment: () => ({ startupMs,
        rendererType: app.renderer.type, rendererName: RendererType[app.renderer.type],
        canvas: { width: app.canvas.width, height: app.canvas.height },
        screen: { width: screen.width, height: screen.height }, dpr: devicePixelRatio,
        terrain: this.world.islandColliders,
        config: { game: GAME_CONFIG, combat: COMBAT_CONFIG, duration: this.world.duration },
      }) })
      Object.assign(window, { __combatProfileTypes: { game: Game.name, world: this.world.constructor.name } })
      Object.assign(window, { __combatProfilePrototypes: { game: Game.prototype, world: Object.getPrototypeOf(this.world),
        container: Container.prototype, sprite: Sprite.prototype, texture: Texture.prototype,
        ticker: Ticker.prototype, audio: HTMLAudioElement.prototype } })
    }
  }
  Game.prototype.destroy = function () {
    if (current?.() === this) terminal = state()
    // Persist only scalar observations, never a Game or renderer reference.
    if (current?.() === this) Object.assign(window, { __combatProfileEnvironment: undefined })
    if (current?.() === this) current = undefined
    destroy.call(this)
  }
  Object.assign(window, { __combatProfile: state, __combatProfileBegin: () => {
    frames = []; samples = []; pauses = []; previous = undefined; lastSample = -1; prior = counters(); recording = true
  }, __combatProfileEnd: () => {
    recording = false
    const result = { frames, samples, final: state() ?? terminal, startupMs,
      events: { ...events }, pauses: structuredClone(pauses), detail: structuredClone(detail) }
    frames = []; samples = []
    return result
  } })
}
