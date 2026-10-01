import { getScoreTip } from '../rules/infoTips.js'
import { useInfoTip } from './useInfoTip.js'

export default function AttributePointPicker({ attributes, bonuses, canIncrease, canDecrease, onIncrease, onDecrease }) {
  const tip = useInfoTip()
  return (
    <div className="point-rows" role="group" aria-label="Attribute points">
      {attributes.map((attribute) => {
        const value = bonuses.find((bonus) => bonus.id === attribute.id)?.value ?? 0
        return (
          <div key={attribute.id} className={`point-row${value ? ' is-selected' : ''}`} {...tip.bind(getScoreTip(attribute.id))}>
            <span className="point-row-name">{attribute.name}</span>
            <button
              type="button"
              className="point-button"
              aria-label={`Decrease ${attribute.name}`}
              disabled={!canDecrease(attribute.id)}
              onClick={() => onDecrease(attribute.id)}
            >
              −
            </button>
            <span className="point-row-value">{value ? `+${value}` : '—'}</span>
            <button
              type="button"
              className="point-button"
              aria-label={`Increase ${attribute.name}`}
              disabled={!canIncrease(attribute.id)}
              onClick={() => onIncrease(attribute.id)}
            >
              +
            </button>
          </div>
        )
      })}
      {tip.element}
    </div>
  )
}
