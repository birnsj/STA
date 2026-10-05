import { useCharacter } from '../character/CharacterContext.jsx'
import { getChoiceOptions, getFixedCareerTalentId, getTalentById, getTalentOptions, getTalentStepTitle } from '../rules/talents.js'
import MechanicsColumn from './MechanicsColumn.jsx'
import TalentPicker from './TalentPicker.jsx'

function instructionFor(character, stepId) {
  if (stepId === 'career') {
    if (!character.career.length) return 'Select a career length to receive its talent.'
    const fixedId = getFixedCareerTalentId(character)
    if (fixedId) {
      const talent = getTalentById(fixedId)
      return `Your career length grants ${talent.name}.${talent.choice ? ' Choose its attribute.' : ''}`
    }
  }
  return 'Choose one talent you qualify for. Talents are separate from your Species Trait, Species Ability, Focuses and Values.'
}

// The step's Character Talent as a numbered mechanics column (Early Outlook, Education, Career).
export default function TalentColumn({ number, stepId, met, locked }) {
  const { character, dispatch } = useCharacter()
  const slot = character.talents[stepId]
  return (
    <MechanicsColumn
      number={number}
      title="Talent"
      helpId="talent"
      instruction={instructionFor(character, stepId)}
      instructionLines={3}
      met={met}
      locked={locked}
    >
      <TalentPicker
        label={`${getTalentStepTitle(stepId)} talent`}
        options={getTalentOptions(character, stepId)}
        slot={slot}
        choiceOptions={slot ? getChoiceOptions(character, stepId, slot.id) : []}
        onSelect={(talentId) => dispatch({ type: 'selectTalent', stepId, talentId })}
        onChoose={(choiceId) => dispatch({ type: 'selectTalentChoice', stepId, choiceId })}
      />
    </MechanicsColumn>
  )
}
