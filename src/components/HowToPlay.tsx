const keys = import.meta.glob('../../assets/keyIcons/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const names: Record<string, string> = { A: 'icons8-uma-chave-50.png', W: 'icons8-w-key-50.png', D: 'icons8-d-key-50.png',
  Q: 'icons8-tecla-q-50.png', E: 'icons8-chave-eletr\u00f4nica-50.png', R: 'icons8-tecla-r-50.png', Space: 'icons8-space-key-50.png' }
function Key({ name }: { name: string }) {
  const url = keys[`../../assets/keyIcons/${names[name]}`]
  return url ? <span className="key-artwork"><img className="key-icon" src={url} alt={`${name} key`} />{name === 'Space' && <small>Space</small>}</span> : <kbd>{name}</kbd>
}
const groups = [
  { title: 'Movement', rows: [['W', 'Move forward'], ['A', 'Turn left'], ['D', 'Turn right']] },
  { title: 'Cannons', rows: [['Space', 'Fire forward'], ['Q', 'Left broadside'], ['E', 'Right broadside']] },
  { title: 'Additional actions', rows: [['R', 'Repair while stationary']] },
]
export default function HowToPlay() {
  return <div className="how-to-play" aria-label="Game instructions">
    <p>Destroy enemy ships to score points. Survive until time runs out.</p>
    <div className="instruction-groups">{groups.map(group => <section key={group.title}>
      <h3>{group.title}</h3>
      <dl>{group.rows.map(([key, action]) => <div key={key}><dt><Key name={key!} /></dt><dd>{action}</dd></div>)}</dl>
    </section>)}</div>
    <p><strong>Repair:</strong> stay still to recover up to 50 HP over 5 seconds. Movement or damage cancels repair; cooldown is 30 seconds.</p>
    <p><strong>Enemies:</strong> Chasers ram your ship; Shooters approach and fire cannons.</p>
    <p>On touch screens, hold the action buttons. Tap Pause or ? to open the instructions.</p>
  </div>
}
