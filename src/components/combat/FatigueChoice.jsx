import { getAttributeName } from '../../character/runtimeCharacter.js'
import { FATIGUE_ATTRIBUTES } from '../../rules/personalCondition.js'

// Book p.278: a character at maximum Stress is Fatigued (+1 Difficulty on all tasks, no more Stress) and selects one
// attribute to shut down: while Fatigued, any task using it automatically fails.
export default function FatigueChoice({ combatant, onChoose }) {
  const { attributes } = combatant.character
  return (
    <div className="combat-modal-backdrop is-injury">
      <div className="combat-modal injury-choice" role="dialog" aria-modal="true" aria-labelledby="fatigue-choice-title">
        <h2 id="fatigue-choice-title" className="combat-modal-title">
          Fatigued
        </h2>
        <p className="injury-choice-who">{combatant.character.name} has reached maximum Stress.</p>
        <p className="injury-choice-detail">+1 Difficulty on all tasks and no more Stress. Choose one attribute to shut down: its tasks automatically fail while Fatigued.</p>
        <div className="combat-modal-actions injury-choice-actions">
          {FATIGUE_ATTRIBUTES.map((attributeId) => (
            <button key={attributeId} type="button" className="combat-button" onClick={() => onChoose(attributeId)}>
              Shut down {getAttributeName(attributeId)}
              <span className="injury-choice-sub">{attributes[attributeId]}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
