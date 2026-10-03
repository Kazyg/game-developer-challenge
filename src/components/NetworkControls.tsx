import { useState, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getScenario, scenarios, setScenario, subscribeScenario } from '../mocks/scenarios'
import type { NetworkScenario } from '../mocks/scenarios'
import { STORAGE_KEYS } from '../api/storage'
import { clearPending, getPending } from '../api/pending'
import { clearCompleted } from '../api/lastCompleted'

export default function NetworkControls() {
  const config = useSyncExternalStore(subscribeScenario, getScenario)
  const client = useQueryClient()
  const [message, setMessage] = useState('')
  const change = (scenario: NetworkScenario) => {
    setScenario(scenario)
    void client.invalidateQueries({ queryKey: ['ranking'] })
    void client.invalidateQueries({ queryKey: ['history'] })
  }
  return <details className="network-controls">
    <summary>Developer / Network Scenarios</summary>
    <label>Network scenario <select value={config.scenario} onChange={event => change(event.target.value as NetworkScenario)}>
      {scenarios.map(scenario => <option key={scenario}>{scenario}</option>)}
    </select></label>
    <button type="button" onClick={() => change('success')}>Return to success</button>
    <button type="button" onClick={() => {
      if (getPending().some(item => item.status === 'Saving') || client.isMutating()) { setMessage('Wait for the active registration before resetting.'); return }
      try { localStorage.removeItem(STORAGE_KEYS.confirmed); clearCompleted(); clearPending(); change('success'); setMessage('Mock records, last result and pending registrations reset. Fixtures restored.') }
      catch { setMessage('Unable to reset local storage.') }
    }}>Reset confirmed + pending records</button>
    <p role="status">{message}</p>
  </details>
}
