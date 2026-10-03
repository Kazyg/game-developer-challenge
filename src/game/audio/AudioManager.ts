import { GAME_CONFIG } from '../config/GameConfig'
const files = typeof window === 'undefined' ? {} : import.meta.glob('../../../assets/sounds/*.{wav,mp3}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
export interface AudioSettings { muted: boolean; volume: number }
const STORAGE_KEY = 'pirate-battle-audio-v1'
function load(): AudioSettings {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as AudioSettings | null
    if (value && typeof value.muted === 'boolean' && Number.isFinite(value.volume)) return { muted: value.muted, volume: Math.max(0, Math.min(1, value.volume)) }
  } catch { /* Storage is optional for sound. */ }
  return { muted: false, volume: GAME_CONFIG.audio.defaultVolume }
}
let settings = load()
const listeners = new Set<() => void>()
const voices: HTMLAudioElement[] = []
const voiceKinds = new WeakMap<HTMLAudioElement, 'menu' | 'game'>()
const recent = new Map<string, number>()
let unlocked = false
let ambience: HTMLAudioElement | undefined
let owner: object | undefined
let ambientPaused = true
export const getAudioSettings = () => settings
export const subscribeAudio = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
function url(name: string) { return files[`../../../assets/sounds/${name}.${name === 'ship_recover' ? 'mp3' : 'wav'}`] }
function playElement(audio: HTMLAudioElement) { void audio.play().catch(() => { /* Missing/blocked audio never interrupts gameplay. */ }) }
function syncAmbient() {
  if (!ambience || !unlocked || ambientPaused || settings.muted) { ambience?.pause(); return }
  ambience.volume = settings.volume * GAME_CONFIG.audio.ambienceVolume
  playElement(ambience)
}
export function setAudioSettings(value: AudioSettings) {
  settings = { muted: value.muted, volume: Math.max(0, Math.min(1, value.volume)) }
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)) } catch { /* Keep session settings. */ }
  for (const voice of voices) { voice.volume = settings.volume; if (settings.muted) voice.pause() }
  syncAmbient()
  listeners.forEach(listener => listener())
}
export function playSound(name: string) {
  if (typeof Audio === 'undefined' || !unlocked || settings.muted || settings.volume === 0) return
  const source = url(name)
  if (!source) return
  const now = performance.now()
  if (now - (recent.get(name) ?? -Infinity) < GAME_CONFIG.audio.eventGapMs) return
  recent.set(name, now)
  let voice = voices.find(audio => audio.paused || audio.ended)
  if (!voice && voices.length < GAME_CONFIG.audio.maxVoices) { voice = new Audio(); voice.preload = 'auto'; voices.push(voice) }
  if (!voice) return
  voiceKinds.set(voice, name.startsWith('ui_') ? 'menu' : 'game')
  voice.src = source; voice.volume = settings.volume; voice.currentTime = 0
  playElement(voice)
}
export function startAmbience(token: object) {
  if (typeof Audio === 'undefined') return
  owner = token; ambientPaused = false
  if (!ambience) { ambience = new Audio(url('ocean_ambience_loop')); ambience.loop = true; ambience.preload = 'auto' }
  syncAmbient()
}
export function pauseAudio(token: object) {
  if (owner !== token) return
  ambientPaused = true; ambience?.pause()
  voices.forEach(voice => { if (voiceKinds.get(voice) !== 'menu') voice.pause() })
}
export function stopAudio(token: object) { if (owner !== token) return; pauseAudio(token); owner = undefined; if (ambience) ambience.currentTime = 0 }
export function installMenuAudio() {
  const unlock = () => { unlocked = true; syncAmbient() }
  const click = (event: MouseEvent) => {
    const button = event.target instanceof Element ? event.target.closest('button') : null
    if (!button || button.disabled || button.closest('.game-input-controls')) return
    const label = button.getAttribute('aria-label') ?? button.textContent?.trim() ?? ''
    if (label === 'Pause' || label === 'Resume') return
    playSound(/Main Menu|Back/.test(label) ? 'ui_back' : /Resume/.test(label) ? 'ui_close' : /Options|How to Play|Pause/.test(label) ? 'ui_open' : 'ui_click')
  }
  window.addEventListener('pointerdown', unlock, { capture: true })
  window.addEventListener('keydown', unlock, { capture: true })
  document.addEventListener('click', click)
  return () => { window.removeEventListener('pointerdown', unlock, true); window.removeEventListener('keydown', unlock, true); document.removeEventListener('click', click) }
}
