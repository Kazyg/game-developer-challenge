import { useId, useState } from 'react'
import ScreenLayout from '../../components/ScreenLayout'
import type { SessionSettings } from '../../SessionSettings'
import { SETTINGS_LIMITS, validSettings } from '../../SessionSettings'
import { MATCH_CONFIG } from '../../game/config/MatchConfig'

type Props = { settings: SessionSettings; onSave: (settings: SessionSettings) => void }
export default function Options({ settings, onSave }: Props) {
  const id = useId()
  const [draft, setDraft] = useState(settings)
  const [message, setMessage] = useState('')
  const valid = validSettings(draft)
  const update = (key: keyof SessionSettings, value: string) => { setDraft(current => ({ ...current, [key]: Number(value) })); setMessage('') }
  return <ScreenLayout title="Options">
    <form onSubmit={event => {
      event.preventDefault()
      if (!valid) return
      try { onSave(draft); setMessage('Settings saved. Changes apply to new matches.') }
      catch { setMessage('Settings could not be saved. Please try again.') }
    }}>
      {([{ key: 'duration', title: 'Game Session Time', min: MATCH_CONFIG.minDuration, max: MATCH_CONFIG.maxDuration },
        { key: 'spawnTime', title: 'Enemy Spawn Time', min: SETTINGS_LIMITS.minSpawnTime, max: SETTINGS_LIMITS.maxSpawnTime }] as const).map(field => {
        const invalid = !Number.isInteger(draft[field.key]) || draft[field.key] < field.min || draft[field.key] > field.max
        return <div className="setting-field" key={field.key}>
          <label htmlFor={`${id}-${field.key}`}>{field.title}: <strong>{draft[field.key]}s</strong></label>
          <input id={`${id}-${field.key}`} type="range" min={field.min} max={field.max} step="1"
            value={draft[field.key]} onChange={event => update(field.key, event.target.value)} aria-describedby={`${id}-${field.key}-hint`} />
          <label className="sr-only" htmlFor={`${id}-${field.key}-number`}>{field.title} in seconds</label>
          <input id={`${id}-${field.key}-number`} type="number" min={field.min} max={field.max} step="1"
            value={Number.isNaN(draft[field.key]) ? '' : draft[field.key]} onChange={event => update(field.key, event.target.value)}
            aria-invalid={invalid} aria-describedby={`${id}-${field.key}-hint`} />
          <p id={`${id}-${field.key}-hint`} className={invalid ? 'validation-error' : ''}>
            {invalid ? `Enter a whole number from ${field.min} to ${field.max} seconds.`
              : field.key === 'spawnTime' ? '1–60 seconds between replacements after an enemy is destroyed. Initial enemies spawn when the match begins.' : '60–180 seconds of active gameplay.'}
          </p>
        </div>
      })}
      <p role="status" aria-live="polite">{message}</p>
      <div className="screen-actions">
        <button type="submit" className="options-save" disabled={!valid}>Save</button>
      </div>
    </form>
  </ScreenLayout>
}
