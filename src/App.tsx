import { loadCompleted, saveCompleted } from './api/lastCompleted'
import { useCallback, useState, useSyncExternalStore } from 'react'
import ConnectedMainMenu from './components/ConnectedMainMenu'
import PendingRegistrations from './components/PendingRegistrations'
import NetworkControls from './components/NetworkControls'
import { useRegistrations } from './api/useRegistrations'
import { loadPlayer } from './api/storage'
import type { MatchRecord } from './api/contracts'
import Options from './screens/Options/Options'
import GameScreen from './screens/Game/GameScreen'
import ResultScreen from './screens/Result/ResultScreen'
import type { MatchResult } from './game/entities/Combat'
import { currentMatchSeed, newMatchSeed } from './game/world/MatchSeed'
import { loadSettings, saveSettings } from './SessionSettings'
import type { SessionSettings } from './SessionSettings'
import './App.css'

type Route = '/' | '/options' | '/game' | '/result'

function subscribeToRoute(onChange: () => void) {
  window.addEventListener('popstate', onChange)
  return () => window.removeEventListener('popstate', onChange)
}

function getRoute() {
  return window.location.pathname
}

function navigate(route: Route) {
  if (window.location.pathname === route) return
  window.history.pushState(null, '', route)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function App() {
  const route = useSyncExternalStore(subscribeToRoute, getRoute)
  const [seed, setSeed] = useState(currentMatchSeed)
  const [settings, setSettings] = useState(loadSettings)
  const [player] = useState(loadPlayer)
  const registrations = useRegistrations()
  const [completed, setCompleted] = useState<MatchRecord | null>(() => loadCompleted()?.match ?? null)
  const [showNetworkControls] = useState(() => new URLSearchParams(window.location.search).get('network') === '1')
  const changeSettings = (value: SessionSettings) => { saveSettings(value); setSettings(value) }
  const startNewMatch = () => { setSeed(newMatchSeed()); navigate('/game') }
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null)
  const submit = registrations.submit
  const handleFinish = useCallback((result: MatchResult, snapshot: SessionSettings) => {
    const match: MatchRecord = { matchId: crypto.randomUUID(), ...player, date: new Date().toISOString(),
      score: result.score, effectiveDuration: result.elapsedSeconds, endReason: result.reason,
      gameConfig: { gameSessionTime: snapshot.duration, enemySpawnTime: snapshot.spawnTime } }
    saveCompleted({ match, seed: result.seed, status: 'Pending' })
    setCompleted(match)
    setMatchResult(result)
    submit(match)
    navigate('/result')
  }, [player, submit])
  const registration = registrations.pending.find(item => item.match.matchId === completed?.matchId)
  const displayedResult = matchResult ?? (completed ? { score: completed.score, elapsedSeconds: completed.effectiveDuration,
    reason: completed.endReason, seed: loadCompleted()?.seed ?? seed, outcome: completed.endReason === 'playerDestroyed' ? 'defeat' as const : 'finished' as const } : null)

  return (
    <main className={route === '/game' ? 'app app-game' : 'app'}>
      {route === '/' && (
        <div className="menu-container"><ConnectedMainMenu
          key={`${settings.duration}-${settings.spawnTime}`}
          config={{ gameSessionTime: settings.duration, enemySpawnTime: settings.spawnTime }} playerId={player.playerId}
          onStart={startNewMatch}
          onOptions={() => navigate('/options')}
        />
        <PendingRegistrations pending={registrations.pending} onRetry={registrations.retry} />
        {showNetworkControls && <NetworkControls />}
        </div>
      )}
      {route === '/options' && (
        <Options
          settings={settings}
          onSave={value => { changeSettings(value); navigate('/') }}
        />
      )}
      {route === '/game' && (
        <GameScreen
          seed={seed}
          settings={settings}
          onSaveSettings={changeSettings}
          onFinish={handleFinish}
          onBack={() => navigate('/')}
        />
      )}
      {route === '/result' && (
        <ResultScreen
          result={displayedResult}
          registrationStatus={registration?.status ?? (loadCompleted()?.status ?? 'Pending')}
          registrationError={registration?.error ?? loadCompleted()?.error}
          onRetry={completed ? () => registrations.retry(completed) : undefined}
          onRestart={startNewMatch}
          onBack={() => navigate('/')}
        />
      )}
      {!['/', '/options', '/game', '/result'].includes(route) && (
        <section className="screen">
          <h1>Page not found</h1>
          <button type="button" onClick={() => navigate('/')}>Main Menu</button>
        </section>
      )}
    </main>
  )
}

export default App




