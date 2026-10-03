import { ACTION_SPECS, getPhaser, TUNING } from '../../combat2/actions2.js'
import { ATTRIBUTE_IDS, DISCIPLINE_IDS, getAttributeName, getDisciplineName } from '../../character/runtimeCharacter.js'
import CombatPortrait from '../combat/CombatPortrait.jsx'
import HitTrack2 from './HitTrack2.jsx'

// The player character's sheet, straight from the exported JSON. The selected action's Attribute and Discipline light up,
// so the player can see which numbers each action uses.
export default function CharacterCard2({ unit, state, actionId }) {
  const { character } = unit
  const spec = actionId ? ACTION_SPECS[actionId] : null
  const phaser = getPhaser(character)
  return (
    <div className="c2-panel c2-character">
      <div className="c2-character-head">
        <CombatPortrait character={character} className="c2-character-portrait" />
        <div className="c2-character-id">
          <p className="c2-character-name">{character.name}</p>
          <p className="c2-character-sub">
            {[character.rank?.name, character.species?.name].filter(Boolean).join(' \u00b7 ')}
          </p>
          <HitTrack2 hits={unit.hits} max={TUNING.maxHits} />
          <div className="c2-character-ap">
            <span className="c2-hit-track-label">AP</span>
            {Array.from({ length: TUNING.actionPoints }, (_, i) => (
              <span key={i} className={`c2-ap-pip${i < state.ap ? ' is-ready' : ''}`} />
            ))}
            <span className="c2-character-pool" title="Momentum and Threat are tracked but have no spends in this prototype yet.">
              Momentum {state.momentum} &middot; Threat {state.threat}
            </span>
          </div>
        </div>
      </div>
      <div className="c2-character-stats">
        <ul>
          {ATTRIBUTE_IDS.map((id) => (
            <li key={id} className={spec?.attribute === id ? 'is-used' : ''}>
              <span>{getAttributeName(id)}</span>
              <b>{character.attributes[id]}</b>
            </li>
          ))}
        </ul>
        <ul>
          {DISCIPLINE_IDS.map((id) => (
            <li key={id} className={spec?.discipline === id ? 'is-used' : ''}>
              <span>{getDisciplineName(id)}</span>
              <b>{character.disciplines[id]}</b>
            </li>
          ))}
        </ul>
      </div>
      <p className="c2-character-line" title={character.focuses.join(', ')}>
        <span>Focuses</span> {character.focuses.join(', ') || 'None'}
      </p>
      <p className="c2-character-line" title={character.values.join(' / ')}>
        <span>Values</span> {character.values.join(' / ') || 'None'}
      </p>
      <p className="c2-character-line">
        <span>Weapon</span> {phaser ? phaser.name : 'No phaser carried'}
      </p>
    </div>
  )
}
