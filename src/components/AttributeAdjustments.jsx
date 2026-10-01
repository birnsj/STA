import { getScoreTip } from '../rules/infoTips.js'
import { canToggleAttributeChoice, getAttributeBonus, getAttributes } from '../rules/species.js'
import { useInfoTip } from './useInfoTip.js'

function RowContent({ name, bonus }) {
  return (
    <>
      <span className="choice-radio" aria-hidden="true" />
      <span className="choice-label">{name}</span>
      <span className="choice-suffix">{bonus ? `(+${bonus})` : '—'}</span>
    </>
  )
}

export default function AttributeAdjustments({ selection, isChoice, instruction, onToggle }) {
  const tip = useInfoTip()
  return (
    <div className="choice-list attribute-choices">
      {instruction && <p className="attribute-instruction">{instruction}</p>}
      {getAttributes().map((attribute) => {
        const bonus = getAttributeBonus(selection, attribute.id)
        const className = `choice attribute-choice${bonus ? ' is-selected' : ''}`
        if (!isChoice) {
          return (
            <div key={attribute.id} className={`${className} is-static`} {...tip.bind(getScoreTip(attribute.id))}>
              <RowContent name={attribute.name} bonus={bonus} />
            </div>
          )
        }
        return (
          <button
            key={attribute.id}
            type="button"
            role="checkbox"
            aria-checked={bonus > 0}
            className={className}
            disabled={!canToggleAttributeChoice(selection, attribute.id)}
            onClick={() => onToggle(attribute.id)}
            {...tip.bind(getScoreTip(attribute.id))}
          >
            <RowContent name={attribute.name} bonus={bonus} />
          </button>
        )
      })}
      {tip.element}
    </div>
  )
}
