import ScreenLayout from '../../components/ScreenLayout'
import HowToPlay from '../../components/HowToPlay'
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { COMBAT_CONFIG } from '../../game/config/CombatConfig'
import type { GameHudState } from '../../game/Game'
import { Game } from '../../game/Game'
import type { MatchResult } from '../../game/entities/Combat'
import Options from '../Options/Options'
import type { SessionSettings } from '../../SessionSettings'
import './GameScreen.css'
import { MOBILE_VIEWPORT_QUERY } from '../../game/viewport'

let orientationSuggestionSeen = false
const orientationSessionKey = 'pirate-battle-orientation-suggestion'

type Props = {
  seed: number
  settings: SessionSettings
  onSaveSettings: (settings: SessionSettings) => void
  onFinish: (result: MatchResult, settings: SessionSettings) => void
  onBack: () => void
}
const controlAssets = import.meta.glob('../../../assets/png/default/ui/controls/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const icon = (name: string) => controlAssets[`../../../assets/png/default/ui/controls/icon_${name}.png`]
const controls = [
  ['KeyA', 'Rotate Left', 'turn_left', 'A'], ['KeyW', 'Forward', 'forward', 'W'], ['KeyD', 'Rotate Right', 'turn_right', 'D'],
  ['KeyQ', 'Left Broadside', 'fire_left', 'Q'], ['Space', 'Front Shot', 'fire_front', 'Space'], ['KeyE', 'Right Broadside', 'fire_right', 'E'],
  ['KeyR', 'Repair', 'plus', 'R'],
] as const

const initialHud = (duration: number): GameHudState => ({ score: 0, timeRemaining: duration,
    hp: COMBAT_CONFIG.player.maxHp, maxHp: COMBAT_CONFIG.player.maxHp, alive: true,
    repairActive: false, repairCooldown: 0, weaponCooldowns: { front: 0, left: 0, right: 0 }, activeCodes: [] })

type Modal = 'pause' | 'help' | 'options' | null

export default function GameScreen({ seed, settings, onSaveSettings, onFinish, onBack }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const gameRef = useRef<Game | null>(null)
  const [snapshotSettings] = useState(settings)
  const [generation, setGeneration] = useState(0)
  const [modal, setModal] = useState<Modal>(null)
  const [failed, setFailed] = useState(false)
  const [orientationSuggestion, setOrientationSuggestion] = useState(false)
  const [status, setStatus] = useState('Loading ocean…')
  const [hud, setHud] = useState<GameHudState>(() => initialHud(snapshotSettings.duration))

  useEffect(() => {
    const mobile = window.matchMedia(MOBILE_VIEWPORT_QUERY)
    const portrait = window.matchMedia('(orientation: portrait)')
    const suggest = () => {
      if (!mobile.matches || !portrait.matches || orientationSuggestionSeen) return
      try { if (sessionStorage.getItem(orientationSessionKey)) return } catch { /* In-memory fallback. */ }
      orientationSuggestionSeen = true
      try { sessionStorage.setItem(orientationSessionKey, 'seen') } catch { /* Storage may be unavailable. */ }
      setOrientationSuggestion(true)
    }
    suggest()
    mobile.addEventListener('change', suggest)
    portrait.addEventListener('change', suggest)
    return () => {
      mobile.removeEventListener('change', suggest)
      portrait.removeEventListener('change', suggest)
    }
  }, [])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let active = true
    setFailed(false)
    setStatus('Loading ocean…')
    setHud(initialHud(snapshotSettings.duration))
    let game: Game | undefined
    const preventWheel = (event: WheelEvent) => event.preventDefault()
    host.addEventListener('wheel', preventWheel, { passive: false })
    // Keep construction and asynchronous renderer startup in the same error boundary.
    void Promise.resolve().then(async () => {
      if (!active) return
      game = new Game(seed, undefined, state => {
        if (active) setHud(state)
      }, result => { if (active) onFinish(result, snapshotSettings) }, {
        duration: snapshotSettings.duration, spawnTime: snapshotSettings.spawnTime,
        onPause: () => { if (active) setModal(current => current ?? 'pause') },
      })
      gameRef.current = game
      await game.start(host)
      if (active && import.meta.env.DEV && new URLSearchParams(location.search).has('test')) {
        Object.assign(window, { __pirateGameTest: game.testController() })
      }
      if (active) setStatus('')
    }).catch((error: unknown) => {
      game?.destroy()
      if (active) setFailed(true)
      if (active) setStatus(error instanceof Error ? error.message : 'Unable to start the game.')
    })
    return () => {
      active = false
      gameRef.current = null
      host.removeEventListener('wheel', preventWheel)
      game?.destroy()
    }
  }, [seed, snapshotSettings, generation, onFinish])

  useEffect(() => {
    if (!modal) {
      if (previousFocus.current?.isConnected) previousFocus.current.focus()
      previousFocus.current = null
      return
    }
    if (!previousFocus.current) previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const dialog = dialogRef.current
    dialog?.querySelector<HTMLElement>('button, input, select, a[href], [tabindex="0"]')?.focus()
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !dialog) return
      const items = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select, a[href], [tabindex="0"]')]
      const first = items[0], last = items.at(-1)
      if (!first || !last) { event.preventDefault(); dialog.focus(); return }
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last.focus() }
      if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', trap)
    return () => document.removeEventListener('keydown', trap)
  }, [modal])
  const resume = () => { gameRef.current?.resume(); setModal(null) }
  const restart = () => {
    gameRef.current?.destroy()
    setModal(null)
    setGeneration(value => value + 1)
  }
  const cooldownFor = (code: string) => {
    if (code === 'KeyR') return { remaining: hud.repairCooldown, total: COMBAT_CONFIG.repair.cooldown }
    const weapon = code === 'Space' ? 'front' : code === 'KeyQ' ? 'left' : code === 'KeyE' ? 'right' : null
    return { remaining: weapon ? hud.weaponCooldowns[weapon] : 0, total: weapon === 'front' ? COMBAT_CONFIG.player.frontCooldown : COMBAT_CONFIG.player.sideCooldown }
  }
  return (
    <section className="game-screen" aria-label="Pirate Battle" data-seed={seed}>
      <div className="game-underlay" inert={!!modal}>
      <div ref={hostRef} className="game-canvas" />
      <div className="game-hud">
        <div className="game-hud-info">
          <span className="score-counter" role="group" aria-label={`Score: ${hud.score}`}><img src={new URL('../../../assets/png/default/ui/hud/icon_score.png', import.meta.url).href} alt="" /><span className="counter-label">Score: </span>{hud.score}</span>
          <span className="time-counter" role="group" aria-label={`Time remaining: ${Math.ceil(hud.timeRemaining)} seconds`}><img src={new URL('../../../assets/png/default/ui/hud/icon_time.png', import.meta.url).href} alt="" /><span className="counter-label">Time remaining: </span>{Math.ceil(hud.timeRemaining)}s</span>
        </div>
        <div className="game-hud-actions">
          <button type="button" aria-label="Pause" onClick={() => gameRef.current?.pause()}><img src={icon('pause')} alt="" /></button>
          <button type="button" aria-label="How to Play" onClick={() => { gameRef.current?.pause(); setModal('help') }}>?</button>
        </div>
      </div>
      <div className="game-input-controls" aria-label="Game controls">
        {([
          { name: 'Movement controls', className: 'movement-controls', items: controls.slice(0, 3) },
          { name: 'Attack controls', className: 'attack-controls', items: controls.slice(3, 6) },
          { name: 'Auxiliary controls', className: 'auxiliary-controls', items: controls.slice(6) },
        ]).map(group => <div key={group.name} className={`control-group ${group.className}`} role="group" aria-label={group.name}>
        {group.items.map(([code, label, asset, key]) => {
          const cooldown = cooldownFor(code)
          return <button key={code} type="button" aria-label={label} disabled={!!status || !!modal || !hud.alive}
          data-code={code}
          data-active={hud.activeCodes.includes(code) || code === 'KeyR' && hud.repairActive}
          data-cooldown={cooldown.remaining > 0}
          title={`${label} (${key})${cooldown.remaining > 0 ? ` - ${cooldown.remaining.toFixed(1)}s` : ''}`}
          onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); gameRef.current?.setPointer(event.pointerId, code, true) }}
          onPointerUp={event => gameRef.current?.setPointer(event.pointerId, code, false)}
          onPointerLeave={event => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) gameRef.current?.setPointer(event.pointerId, code, false) }}
          onPointerCancel={event => gameRef.current?.cancelPointer(event.pointerId)}
          onLostPointerCapture={event => gameRef.current?.cancelPointer(event.pointerId)}>
          <img src={icon(asset)} alt="" />
          {cooldown.remaining > 0 && <span className="command-cooldown" style={{ '--cooldown-angle': `${Math.min(1, cooldown.remaining / cooldown.total) * 360}deg` } as CSSProperties}>
            <span>{Math.ceil(cooldown.remaining)}s</span>
          </span>}
        </button>})}
        </div>)}
      </div>
      {orientationSuggestion && <aside className="portrait-hint" aria-label="Orientation suggestion">
        <p role="status">For a wider view, try rotating your phone.</p>
        <button type="button" aria-label="Dismiss orientation suggestion" onClick={() => setOrientationSuggestion(false)}>Got it</button>
      </aside>}
      {status && <div className="game-status"><p role={failed ? 'alert' : 'status'}>{status}</p>{failed && <><button onClick={restart}>Retry</button><button onClick={onBack}>Main Menu</button></>}</div>}
      </div>
      {modal && <div className="game-modal-backdrop">
        <section ref={dialogRef} tabIndex={-1} className="game-modal" role="dialog" aria-modal="true" aria-label={modal === 'help' ? 'How to Play' : modal === 'options' ? 'Options' : 'Pause Menu'}>
          {modal === 'help' ? <ScreenLayout title="How to Play" scrollable footer={<div className="screen-actions help-actions">
            <button type="button" className="help-resume" onClick={resume}>Resume</button>
          </div>}><HowToPlay /></ScreenLayout> : modal === 'options' ? <Options settings={settings} onSave={value => { onSaveSettings(value); setModal('pause') }} /> : <>
            <h1>Pause Menu</h1>
            <div className="screen-actions pause-actions">
              <button type="button" className="pause-resume" onClick={resume}>Resume</button>
              {modal === 'pause' && <>
                <button type="button" onClick={() => setModal('options')}>Options</button>
                <button type="button" onClick={restart}>Restart Match</button>
                <button type="button" onClick={onBack}>Main Menu</button>
              </>}
            </div>
          </>}
        </section>
      </div>}
    </section>
  )
}

