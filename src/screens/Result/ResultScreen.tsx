import ScreenLayout from '../../components/ScreenLayout'
import type { MatchResult } from '../../game/entities/Combat'
import type { RegistrationStatus } from '../../components/MatchData'
import { endReasonLabel } from '../../components/MatchData'

type Props = { result: MatchResult | null; registrationStatus?: RegistrationStatus; registrationError?: string; onRetry?: () => void; onRestart: () => void; onBack: () => void }
export default function ResultScreen({ result, registrationStatus = 'Pending', registrationError, onRetry, onRestart, onBack }: Props) {
  return <ScreenLayout title={result?.reason === 'playerDestroyed' ? 'Game Over' : 'Match Result'}>
    {result ? <dl className="result-details">
      <div><dt>Score</dt><dd>{result.score}</dd></div>
      <div><dt>Time Played</dt><dd>{Math.floor(result.elapsedSeconds)}s</dd></div>
      <div><dt>End Reason</dt><dd>{endReasonLabel(result.reason)}</dd></div>
      <div><dt>Match Registration Status</dt><dd role="status" aria-live="polite">{registrationStatus}</dd></div>
    </dl> : <p>No match result is available. Play a match to see your results.</p>}
    <div className="screen-actions">
      {registrationError && <p role="alert">{registrationError}</p>}
      {result && onRetry && (registrationStatus === 'Pending' || registrationStatus === 'Failed') && <button type="button" onClick={onRetry}>Retry Registration</button>}
      <button type="button" onClick={onRestart}>Play Again</button>
      <button type="button" className="secondary" onClick={onBack}>Main Menu</button>
    </div>
  </ScreenLayout>
}
