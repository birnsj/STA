import { useState } from 'react'
import attributeData from '../../data/source/attributes.json'
import disciplineData from '../../data/source/disciplines.json'

const ATTRIBUTES = attributeData.attributes
const DEPARTMENTS = disciplineData.disciplines

function compactNeutralize(record) {
  const next = {}
  if (typeof record.label === 'string' && record.label.trim()) next.label = record.label.trim()
  if (record.attribute) next.attribute = record.attribute
  if (record.department) next.department = record.department
  if (Number.isFinite(record.difficulty)) next.difficulty = record.difficulty
  if (Array.isArray(record.focuses) && record.focuses.length) next.focuses = record.focuses
  if (record.equipment && typeof record.equipment === 'object') next.equipment = record.equipment
  return Object.keys(next).length ? next : null
}

/**
 * Map-editor fields for a hazard region's neutralize override (merged over hazards.json neutralize).
 * fallback: the type's neutralize object. value: region.neutralize (partial).
 */
export default function NeutralizeTaskFields({ value = null, fallback, onChange }) {
  const override = value && typeof value === 'object' ? value : {}
  const set = (changes) => {
    const merged = { ...override, ...changes }
    Object.keys(changes).forEach((key) => {
      if (changes[key] == null || changes[key] === '') delete merged[key]
    })
    onChange(compactNeutralize(merged))
  }

  const focusesText = (override.focuses ?? []).join(', ')
  const [focusDraft, setFocusDraft] = useState(focusesText)
  const [equipText, setEquipText] = useState(() =>
    override.equipment ? JSON.stringify(override.equipment, null, 2) : '',
  )
  const [equipError, setEquipError] = useState('')

  const applyEquipment = () => {
    try {
      if (!equipText.trim()) {
        setEquipError('')
        set({ equipment: null })
        return
      }
      const parsed = JSON.parse(equipText)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setEquipError('Equipment must be a JSON object (prepareTask shape).')
        return
      }
      setEquipError('')
      set({ equipment: parsed })
    } catch (error) {
      setEquipError(error.message)
    }
  }

  return (
    <div className="me-neutralize-fields">
      <label className="me-field">
        Neutralize label
        <input
          className="me-name me-wide"
          value={override.label ?? ''}
          placeholder={fallback.label}
          onChange={(event) => set({ label: event.target.value.trim() ? event.target.value : null })}
        />
      </label>
      <label className="me-field">
        Attribute
        <select
          className="me-select me-wide"
          value={override.attribute ?? ''}
          onChange={(event) => set({ attribute: event.target.value || null })}
        >
          <option value="">{fallback.attribute} (type)</option>
          {ATTRIBUTES.map((attribute) => (
            <option key={attribute.id} value={attribute.id}>
              {attribute.name}
            </option>
          ))}
        </select>
      </label>
      <label className="me-field">
        Department
        <select
          className="me-select me-wide"
          value={override.department ?? ''}
          onChange={(event) => set({ department: event.target.value || null })}
        >
          <option value="">{fallback.department} (type)</option>
          {DEPARTMENTS.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </select>
      </label>
      <label className="me-field">
        Difficulty
        <input
          className="me-name me-wide"
          type="number"
          min={0}
          max={5}
          value={override.difficulty ?? ''}
          placeholder={`${fallback.difficulty} (type)`}
          onChange={(event) =>
            set({ difficulty: event.target.value === '' ? null : Math.min(5, Math.max(0, Number(event.target.value))) })
          }
        />
      </label>
      <label className="me-field">
        Focuses (exact names, commas)
        <input
          className="me-name me-wide"
          value={focusDraft}
          placeholder={(fallback.focuses ?? []).join(', ') || 'none'}
          onChange={(event) => {
            setFocusDraft(event.target.value)
            const focuses = event.target.value
              .split(',')
              .map((entry) => entry.trim())
              .filter(Boolean)
            set({ focuses: focuses.length ? focuses : null })
          }}
        />
      </label>
      <label className="me-field">
        Equipment (JSON; prepareTask shape; blank = type)
        <textarea
          className="me-name me-wide"
          rows={3}
          value={equipText}
          spellCheck={false}
          placeholder='e.g. { "label": "engineering tools", "tags": ["engineering"], "without": { "difficulty": 1 } }'
          onChange={(event) => setEquipText(event.target.value)}
          onBlur={applyEquipment}
        />
      </label>
      {equipError && <p className="me-text is-warning">{equipError}</p>}
    </div>
  )
}
