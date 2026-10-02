import { COMBAT_CONFIG } from '../config/CombatConfig'

export interface InputState {
  up: boolean
  down: boolean
  left: boolean
  right: boolean
  actions?: { front: boolean; left: boolean; right: boolean; repair: boolean }
}

export class InputManager {
  private keys = new Set<string>()
  private pointerShots = new Map<number, string>()
  private requested(code: string) { return this.shotRequests.has(code) || [...this.pointerShots.values()].includes(code) }
  cancelPointer(id: number) {
    const code = this.pointers.get(id)
    if (code === undefined) return
    this.pointers.delete(id)
    this.pointerShots.delete(id)
    if (code === COMBAT_CONFIG.bindings.repair && !this.held(code)) this.repairRequested = false
  }
  private shotRequests = new Set<string>()
  getHeldCodes() { return [...new Set([...this.keys, ...this.pointers.values()])] }
  private pointers = new Map<number, string>()
  private held(code: string) { return this.keys.has(code) || [...this.pointers.values()].includes(code) }
  setPointer(pointerId: number, code: string, down: boolean) {
    if (!down) { this.pointers.delete(pointerId); return }
    if (!this.enabled || !this.controlledKeys.has(code)) return
    this.pointers.set(pointerId, code)
    if (code !== COMBAT_CONFIG.bindings.repair && Object.values(COMBAT_CONFIG.bindings).some(binding => binding === code)) this.pointerShots.set(pointerId, code)
    if (code === COMBAT_CONFIG.bindings.repair) this.repairRequested = true
  }
  private repairRequested = false
  private enabled = true
  private readonly controlledKeys = new Set<string>(['KeyW', 'KeyA', 'KeyD', ...Object.values(COMBAT_CONFIG.bindings)])

  private onKeyDown = (event: KeyboardEvent) => {
    if (!this.enabled || event.repeat && !this.keys.has(event.code)) return
    if (!this.controlledKeys.has(event.code) || event.ctrlKey || event.metaKey || event.altKey) return
    if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable]')) return
    event.preventDefault()
    this.keys.add(event.code)
    if (!event.repeat && event.code !== COMBAT_CONFIG.bindings.repair && Object.values(COMBAT_CONFIG.bindings).some(binding => binding === event.code)) this.shotRequests.add(event.code)
    if (event.code === COMBAT_CONFIG.bindings.repair && !event.repeat) this.repairRequested = true
  }

  private onKeyUp = (event: KeyboardEvent) => { this.keys.delete(event.code) }
  clear = () => { this.keys.clear(); this.pointers.clear(); this.shotRequests.clear(); this.pointerShots.clear(); this.repairRequested = false }

  setEnabled(enabled: boolean) { this.enabled = enabled; this.clear() }

  constructor() {
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.clear)
    document.addEventListener('visibilitychange', this.clear)
  }

  read(): InputState {
    const actions = {
      front: this.held(COMBAT_CONFIG.bindings.front) || this.requested(COMBAT_CONFIG.bindings.front),
      left: this.held(COMBAT_CONFIG.bindings.left) || this.requested(COMBAT_CONFIG.bindings.left),
      right: this.held(COMBAT_CONFIG.bindings.right) || this.requested(COMBAT_CONFIG.bindings.right),
      repair: this.repairRequested,
    }
    this.repairRequested = false
    this.shotRequests.clear()
    this.pointerShots.clear()
    const movement = { up: this.held('KeyW'), down: false, left: this.held('KeyA'), right: this.held('KeyD') }
    return Object.values(actions).some(Boolean) ? { ...movement, actions } : movement
  }

  destroy() {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.clear)
    document.removeEventListener('visibilitychange', this.clear)
    this.clear()
  }
}
