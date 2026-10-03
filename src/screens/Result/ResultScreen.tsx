import type { RegistrationStatus } from '../../api/contracts'
import ScreenLayout from '../../components/ScreenLayout'
import type { MatchResult } from '../../game/entities/Combat'
import { endReasonLabel } from '../../components/MatchData'

type Props = { result: MatchResult | null; registrationStatus?: RegistrationStatus; registrationError?: string;
  onRetry?: () => void; onRestart: () => void; onBack: () => void }
export default function ResultScreen({ result, registrationStatus = 'Pending', registrationError, onRetry, onRestart, onBack }: Props) {
  return <ScreenLayout title={result?.reason === 'playerDestroyed' ? 'Game Over' : 'Match Result'} scrollable footer={<div className="screen-actions">
    <button type="button" onClick={onRestart}>Play Again</button>
    <button type="button" className="secondary" onClick={onBack}>Main Menu</button>
  </div>}>
    {result ? <dl className="result-details">
      <div><dt>Score</dt><dd>{result.score}</dd></div>
      <div><dt>Time Played</dt><dd>{Math.floor(result.elapsedSeconds)}s</dd></div>
      <div><dt>End Reason</dt><dd>{endReasonLabel(result.reason)}</dd></div>
    </dl> : <p>No match result is available. Play a match to see your results.</p>}
    {result && <section aria-label="Match registration">
      <h2>Match Registration Status</h2>
      <p role="status" aria-live="polite">{registrationStatus}</p>
      {registrationError && <p role="alert">{registrationError}</p>}
      {registrationStatus === 'Pending' && <p>Your result is waiting to be sent. You can keep playing.</p>}
      {registrationStatus === 'Saved' && <p>Your result is available in Ranking and Match History.</p>}
      {onRetry && registrationStatus !== 'Saved' && <button type="button" disabled={registrationStatus === 'Saving'} onClick={onRetry}>Retry Registration</button>}
    </section>}
  </ScreenLayout>
}
