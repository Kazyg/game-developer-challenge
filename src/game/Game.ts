import { pauseAudio, playSound, startAmbience, stopAudio } from './audio/AudioManager'
import { FixedStep } from './FixedStep'
import { playWorldEvents } from './audio/WorldAudio'
import { Application } from 'pixi.js'
import { Camera } from './camera/Camera'
import { isMobileViewport } from './viewport'
import { InputManager } from './input/InputManager'
import { World } from './world/World'
import { WorldRenderer } from './rendering/WorldRenderer'
import { GAME_CONFIG } from './config/GameConfig'
import { COMBAT_CONFIG } from './config/CombatConfig'
import type { MatchResult, WeaponCooldowns } from './entities/Combat'

export interface GameHudState {
  score: number
  timeRemaining: number
  hp: number
  maxHp: number
  alive: boolean
  repairActive: boolean
  repairCooldown: number
  weaponCooldowns: WeaponCooldowns
  activeCodes: string[]
}

export class Game {
  readonly world: World
  readonly camera = new Camera()
  private readonly app = new Application()
  private readonly view: WorldRenderer
  private input: InputManager | undefined
  private resizeObserver: ResizeObserver | undefined
  private disposed = false
  private initialized = false
  private loadingView = false
  private released = false
  private host: HTMLElement | undefined
  private readonly onHudUpdate: ((state: GameHudState) => void) | undefined
  private hudElapsed = 0
  private gameOverNotified = false
  private readonly onGameOver: ((result: MatchResult) => void) | undefined
  private readonly onPause: (() => void) | undefined
  private lastTickTime = 0
  private resultElapsed = 0
  private readonly simulationClock = new FixedStep()
  private startTask: Promise<void> | undefined
  cancelPointer(id: number) { this.input?.cancelPointer(id); this.publishHud() }
  setPointer(id: number, code: string, down: boolean) { this.input?.setPointer(id, code, down); this.publishHud() }

  /** Development-only test facade. Gameplay tests still use real DOM input. */
  testController() {
    if (!import.meta.env.DEV) throw new Error('Game instrumentation is only available in development.')
    return {
      world: this.world,
      stopClock: () => this.app.stop(),
      advance: (seconds: number) => {
        const steps = Math.round(seconds / this.simulationClock.step)
        for (let step = 0; step < steps; step++) {
          this.world.update(this.input?.read() ?? { up: false, down: false, left: false, right: false }, this.simulationClock.step)
          playWorldEvents(this.world.drainEvents())
        }
        this.render()
        this.app.render()
        this.publishHud()
      },
      render: () => { this.render(); this.app.render() },
      renderAt: (x: number, y: number, width: number, height: number) => {
        Object.assign(this.camera.position, { x, y })
        this.view.render(this.world, this.camera, width, height)
        this.app.render()
      },
      toggleDebug: () => { this.view.toggleDebugColliders(); this.render() },
      observe: () => ({ disposed: this.disposed, ...this.view.observe(),
        seed: this.world.seed, time: this.world.time, hp: this.world.player.hp, score: this.world.score,
        paused: this.world.paused, gameOver: this.world.gameOver }),
      finish: (reason: 'timeExpired' | 'playerDestroyed' = 'timeExpired') => {
        this.world.paused = false
        this.world.finish(reason)
        this.lastTickTime = performance.now() - COMBAT_CONFIG.effects.sinkingDuration * 1000
        this.tick()
      },
    }
  }

  constructor(seed: number, debugColliders: boolean = GAME_CONFIG.debugColliders,
    onHudUpdate?: (state: GameHudState) => void, onGameOver?: (result: MatchResult) => void,
    options: { duration?: number; spawnTime?: number; onPause?: () => void } = {}) {
    this.world = new World(seed, { duration: options.duration, spawnTime: options.spawnTime })
    this.onPause = options.onPause
    this.view = new WorldRenderer(debugColliders)
    this.onHudUpdate = onHudUpdate
    this.onGameOver = onGameOver
  }

  start(host: HTMLElement): Promise<void> {
    this.startTask ??= this.startInternal(host)
    return this.startTask
  }

  private async startInternal(host: HTMLElement): Promise<void> {
    this.host = host
    await this.app.init({
      width: Math.max(1, Math.min(host.clientWidth, this.world.width)),
      height: Math.max(1, Math.min(host.clientHeight, this.world.height)),
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      antialias: true,
      autoStart: false,
      background: '#239db0',
    })
    this.initialized = true
    if (this.disposed) { this.release(); return }
    this.loadingView = true
    try { await this.view.initialize(this.app, this.world) }
    finally { this.loadingView = false; if (this.disposed) this.release() }
    if (this.disposed) { this.release(); return }

    this.app.canvas.setAttribute('aria-label', 'Pirate Battle ocean')
    host.appendChild(this.app.canvas)
    this.input = new InputManager()
    this.input.setEnabled(!this.world.paused)
    this.resizeObserver = new ResizeObserver(this.resize)
    this.resizeObserver.observe(host)
    window.addEventListener('resize', this.resize)
    window.addEventListener('keydown', this.onDebugKeyDown)
    window.addEventListener('keydown', this.onPauseKey)
    window.addEventListener('blur', this.onAutoPause)
    document.addEventListener('visibilitychange', this.onVisibility)
    if (document.visibilityState === 'hidden') this.pause()
    this.resize()
    this.publishHud()
    this.app.ticker.add(this.tick)
    this.lastTickTime = performance.now()
    this.app.start()
    if (!this.world.paused) startAmbience(this)
    playSound('game_start')
  }

  private resize = () => {
    if (this.disposed || !this.host) return
    const width = Math.max(1, Math.min(this.host.clientWidth, this.world.width))
    const height = Math.max(1, Math.min(this.host.clientHeight, this.world.height))
    if (width !== this.app.screen.width || height !== this.app.screen.height) {
      this.input?.clear()
      this.publishHud()
    }
    this.app.renderer.resize(
      width,
      height,
      window.devicePixelRatio || 1,
    )
    this.render()
  }

  private onDebugKeyDown = (event: KeyboardEvent) => {
    if (event.code !== 'KeyU' || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return
    if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable]')) return
    event.preventDefault()
    this.view.toggleDebugColliders()
    this.render()
  }

  private tick = () => {
    if (this.disposed || this.gameOverNotified) return
    const now = performance.now()
    const frameDelta = (now - this.lastTickTime) / 1000
    this.lastTickTime = now
    if (this.world.paused) return
    this.simulationClock.advance(frameDelta, dt => {
      if (this.input) this.world.update(this.input.read(), dt)
      playWorldEvents(this.world.drainEvents())
      return !this.world.gameOver
    })
    if (this.world.gameOver) {
      this.input?.setEnabled(false)
      this.publishHud()
      // Only render destruction effects after completion; gameplay remains frozen.
      this.resultElapsed += frameDelta
      this.render()
      this.view.renderEnding(this.world, frameDelta)
      if (this.world.endReason === 'playerDestroyed' && this.resultElapsed < COMBAT_CONFIG.effects.sinkingDuration) return
      stopAudio(this)
      playSound(this.world.endReason === 'playerDestroyed' ? 'game_over' : 'game_complete')
      this.gameOverNotified = true
      this.app.stop()
      this.app.ticker.remove(this.tick)
      this.input?.destroy()
      this.input = undefined
      this.onGameOver?.({ outcome: this.world.endReason === 'playerDestroyed' ? 'defeat' : 'finished',
        reason: this.world.endReason, score: this.world.score, seed: this.world.seed, elapsedSeconds: this.world.time })
      return
    }
    this.render()
    this.hudElapsed += frameDelta
    if (this.hudElapsed >= COMBAT_CONFIG.hudUpdateInterval) {
      this.hudElapsed %= COMBAT_CONFIG.hudUpdateInterval
      this.publishHud()
    }
  }

  private publishHud() {
    const player = this.world.player
    this.onHudUpdate?.({ score: this.world.score, timeRemaining: this.world.timeRemaining,
      hp: player.hp, maxHp: player.maxHp, alive: player.alive,
      repairActive: player.repair.active, repairCooldown: player.repair.cooldown,
      activeCodes: this.input?.getHeldCodes() ?? [], weaponCooldowns: { ...player.weaponCooldowns } })
  }

  private render() {
    const { width, height } = this.app.screen
    const mobile = isMobileViewport()
    // Camera and culling use world units; DOM controls retain their native touch size.
    this.camera.zoom = Math.max(mobile ? GAME_CONFIG.camera.mobileZoom : 1, width / this.world.width, height / this.world.height)
    const visibleWidth = width / this.camera.zoom, visibleHeight = height / this.camera.zoom
    this.camera.follow(this.world.player.position, visibleWidth, visibleHeight, this.world.width, this.world.height)
    this.view.render(this.world, this.camera, visibleWidth, visibleHeight)
  }

  destroy() {
    stopAudio(this)
    this.disposed = true
    this.input?.destroy()
    this.resizeObserver?.disconnect()
    window.removeEventListener('resize', this.resize)
    window.removeEventListener('keydown', this.onDebugKeyDown)
    window.removeEventListener('keydown', this.onPauseKey)
    window.removeEventListener('blur', this.onAutoPause)
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.release()
  }

  pause() {
    if (this.disposed || this.world.gameOver) return
    this.lastTickTime = performance.now()
    if (!this.world.paused) { pauseAudio(this); playSound('game_pause') }
    this.world.paused = true
    this.input?.setEnabled(false)
    this.onPause?.()
  }

  resume() {
    if (this.disposed || this.world.gameOver) return
    this.input?.setEnabled(true)
    this.lastTickTime = performance.now()
    this.world.paused = false
    startAmbience(this)
    playSound('game_resume')
  }

  private onPauseKey = (event: KeyboardEvent) => {
    if (event.code === 'Escape' && !event.repeat) { event.preventDefault(); this.pause() }
  }
  private onAutoPause = () => this.pause()
  private onVisibility = () => { if (document.visibilityState === 'hidden') this.pause() }

  private release() {
    if (!this.initialized || this.loadingView || this.released) return
    this.released = true
    this.app.stop()
    this.app.ticker.remove(this.tick)
    this.view.destroy()
    const canvas = this.app.canvas
    if (canvas.parentElement === this.host) canvas.remove()
    this.app.destroy(false, { children: true })
  }
}
