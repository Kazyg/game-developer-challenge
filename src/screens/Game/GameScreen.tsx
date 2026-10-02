import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { COMBAT_CONFIG } from '../../game/config/CombatConfig'
import type { GameHudState } from '../../game/Game'
import { Game } from '../../game/Game'
import type { MatchResult } from '../../game/entities/Combat'
import Options from '../Options/Options'
import type { SessionSettings } from '../../SessionSettings'
import './GameScreen.css'

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
  const [status, setStatus] = useState('Loading ocean…')
  const [hud, setHud] = useState<GameHudState>(() => initialHud(snapshotSettings.duration))

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let active = true
    setFailed(false)
    setStatus('Loading ocean…')
    setHud(initialHud(snapshotSettings.duration))
    const game = new Game(seed, undefined, state => {
      if (active) setHud(state)
    }, result => { if (active) onFinish(result, snapshotSettings) }, {
      duration: snapshotSettings.duration, spawnTime: snapshotSettings.spawnTime,
      onPause: () => { if (active) setModal(current => current ?? 'pause') },
    })
    gameRef.current = game
    const preventWheel = (event: WheelEvent) => event.preventDefault()
    host.addEventListener('wheel', preventWheel, { passive: false })
    void game.start(host).then(() => { if (active) setStatus('') }).catch((error: unknown) => {
      game.destroy()
      if (active) setFailed(true)
      if (active) setStatus(error instanceof Error ? error.message : 'Unable to start the game.')
    })
    return () => {
      active = false
      gameRef.current = null
      host.removeEventListener('wheel', preventWheel)
      game.destroy()
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
    dialog?.querySelector<HTMLElement>('button, input, select, [tabindex="0"]')?.focus()
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !dialog) return
      const items = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select, [tabindex="0"]')]
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
          <span className="score-counter"><img src={new URL('../../../assets/png/default/ui/hud/icon_score.png', import.meta.url).href} alt="" />Score: {hud.score}</span>
          <span className="time-counter"><img src={new URL('../../../assets/png/default/ui/hud/icon_time.png', import.meta.url).href} alt="" />Time remaining: {Math.ceil(hud.timeRemaining)}s</span>
        </div>
        <div className="game-hud-actions">
          <button type="button" aria-label="Pause" onClick={() => gameRef.current?.pause()}><img src={icon('pause')} alt="" /></button>
          <button type="button" aria-label="How to Play" onClick={() => { gameRef.current?.pause(); setModal('help') }}>?</button>
        </div>
      </div>
      <div className="game-input-controls" aria-label="Game controls">
        {controls.map(([code, label, asset, key]) => {
          const cooldown = cooldownFor(code)
          return <button key={code} type="button" aria-label={label} disabled={!!status || !!modal || !hud.alive}
          data-active={hud.activeCodes.includes(code) || code === 'KeyR' && hud.repairActive}
          data-cooldown={cooldown.remaining > 0}
          title={`${label} (${key})${cooldown.remaining > 0 ? ` - ${cooldown.remaining.toFixed(1)}s` : ''}`}
          onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); gameRef.current?.setPointer(event.pointerId, code, true) }}
          onPointerUp={event => gameRef.current?.setPointer(event.pointerId, code, false)}
          onPointerLeave={event => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) gameRef.current?.setPointer(event.pointerId, code, false) }}
          onPointerCancel={event => gameRef.current?.cancelPointer(event.pointerId)}
          onLostPointerCapture={event => gameRef.current?.cancelPointer(event.pointerId)}>
          <img src={icon(asset)} alt="" /><small>{key}</small>
          {cooldown.remaining > 0 && <span className="command-cooldown" style={{ '--cooldown-angle': `${Math.min(1, cooldown.remaining / cooldown.total) * 360}deg` } as CSSProperties}>
            <span>{Math.ceil(cooldown.remaining)}s</span>
          </span>}
        </button>})}
      </div>
      <p className="portrait-hint">Rotate your device to landscape for more space.</p>
      {status && <div className="game-status"><p role={failed ? 'alert' : 'status'}>{status}</p>{failed && <><button onClick={restart}>Retry</button><button onClick={onBack}>Main Menu</button></>}</div>}
      </div>
      {modal && <div className="game-modal-backdrop">
        <section ref={dialogRef} tabIndex={-1} className="game-modal" role="dialog" aria-modal="true" aria-label={modal === 'help' ? 'How to Play' : modal === 'options' ? 'Options' : 'Pause Menu'}>
          {modal === 'options' ? <Options settings={settings} onSave={value => { onSaveSettings(value); setModal('pause') }} /> : <>
            <h1>{modal === 'help' ? 'How to Play' : 'Pause Menu'}</h1>
            {modal === 'help' && <>
              <div className="help-controls">{controls.map(([, label, asset, key]) => <div key={label}><img src={icon(asset)} alt="" /><span>{label} <kbd>{key}</kbd></span></div>)}</div>
              <p>Chaser pursues you and deals contact damage. Shooter approaches and fires cannons.</p>
              <p>W: move forward · A / D: turn left / right.</p>
              <p>Space: fire forward · Q / E: fire left / right.</p>
              <p>R: Repair. Stay still to recover up to 50 HP. Movement or damage cancels repair; 30s cooldown.</p>
              <p>Destroy enemies to score points and survive until time runs out. U: debug.</p>
            </>}
            <div className={`screen-actions ${modal === 'help' ? 'help-actions' : 'pause-actions'}`}>
              <button type="button" className={modal === 'help' ? 'help-resume' : 'pause-resume'} onClick={resume}>Resume</button>
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

