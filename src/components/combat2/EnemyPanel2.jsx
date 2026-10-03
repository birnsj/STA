import { TUNING } from '../../combat2/actions2.js'
import { describeIntent } from '../../combat2/intents2.js'
import CombatPortrait from '../combat/CombatPortrait.jsx'
import HitTrack2 from './HitTrack2.jsx'

// What each Klingon plans to do on the enemy turn. Pointing at a row shows that enemy's threatened tiles.
export default function EnemyPanel2({ state, onHover }) {
  const enemies = state.order.filter((id) => state.units[id].side === 'enemy').map((id) => state.units[id])
  return (
    <div className="c2-panel c2-enemies">
      <p className="c2-panel-title">Enemy Intent</p>
      <ul>
        {enemies.map((enemy) => {
          const intent = state.intents[enemy.id]
          const down = enemy.status !== 'active'
          return (
            <li key={enemy.id} className={down ? 'is-down' : ''} onMouseEnter={() => onHover(enemy.id)} onMouseLeave={() => onHover(null)}>
              <CombatPortrait character={enemy.character} className="c2-enemy-portrait" />
              <div>
                <p className="c2-enemy-name">{enemy.character.name}</p>
                <HitTrack2 hits={enemy.hits} max={TUNING.maxHits} label="" />
                <p className={`c2-enemy-intent is-${intent?.kind ?? 'hold'}`}>
                  {down ? 'Defeated' : state.phase === 'player' && intent ? `INTENT: ${describeIntent(intent, state)}` : 'Acting...'}
                </p>
                {!down && intent?.preview && state.phase === 'player' && (
                  <p className="c2-muted">
                    {intent.preview.task.attribute.name} {intent.preview.task.attribute.value} + {intent.preview.task.discipline.name} {intent.preview.task.discipline.value}, Difficulty {intent.preview.task.difficulty}
                    {intent.preview.cover ? ' (you are in cover)' : ''}
                  </p>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
