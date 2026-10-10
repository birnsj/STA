import { DISPOSITION_IDS, ACTION_TYPES, getActionType } from '../../conversation/conversationActions.js'
import { challengeDefinitionsFor } from '../../exploration/challengeObjects.js'
import { CHANGE_OPS, CONDITION_OPS, flagValueText, OBJECTIVE_STATUSES, parseFlagValue } from '../../exploration/missionFlags.js'

// Editors for the parts of a conversation node that are lists of small objects: flag conditions and actions
// (conversationActions.js). map: the map open in the editor, for the objective and challenge object pickers.

const replaceAt = (list, index, item) => list.map((entry, at) => (at === index ? item : entry))
const removeAt = (list, index) => list.filter((_, at) => at !== index)

function ValueInput({ value, onChange, placeholder = 'true, 3, text' }) {
  return <input className="ce-input ce-value" value={flagValueText(value)} placeholder={placeholder} onChange={(event) => onChange(parseFlagValue(event.target.value))} />
}

// conditions: [{ flag, op, value }] (missionFlags.js).
export function ConditionsEditor({ conditions, onChange }) {
  return (
    <div className="ce-list">
      {conditions.map((condition, index) => {
        const op = CONDITION_OPS.find((entry) => entry.id === condition.op) ?? CONDITION_OPS[0]
        return (
          <div key={index} className="ce-row">
            <input className="ce-input ce-flag" value={condition.flag} placeholder="flag" onChange={(event) => onChange(replaceAt(conditions, index, { ...condition, flag: event.target.value.trim() }))} />
            <select className="ce-input" value={op.id} onChange={(event) => onChange(replaceAt(conditions, index, { ...condition, op: event.target.value }))}>
              {CONDITION_OPS.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
            {op.needsValue && <ValueInput value={condition.value} onChange={(value) => onChange(replaceAt(conditions, index, { ...condition, value }))} />}
            <button type="button" className="ce-button is-small" aria-label="Remove condition" onClick={() => onChange(removeAt(conditions, index))}>
              ×
            </button>
          </div>
        )
      })}
      <button type="button" className="ce-button is-small" onClick={() => onChange([...conditions, { flag: '', op: 'isTrue' }])}>
        + Condition
      </button>
    </div>
  )
}

function ActionField({ field, action, map, onChange }) {
  const value = action[field.key]
  const set = (next) => onChange({ ...action, [field.key]: next })
  const options = (list) => (
    <select className="ce-input" value={value ?? ''} onChange={(event) => set(event.target.value)}>
      {!list.some((entry) => entry.id === value) && <option value={value ?? ''}>{value ? `${value} (unknown)` : 'Choose…'}</option>}
      {list.map((entry) => (
        <option key={entry.id} value={entry.id}>
          {entry.label}
        </option>
      ))}
    </select>
  )
  switch (field.kind) {
    case 'number':
      return <input className="ce-input ce-number" type="number" value={value ?? 0} onChange={(event) => set(Number(event.target.value))} />
    case 'flagOp':
      return options(CHANGE_OPS)
    case 'value':
      return action.op === 'clear' ? null : <ValueInput value={value} onChange={set} />
    case 'disposition':
      return options(DISPOSITION_IDS.map((id) => ({ id, label: id })))
    case 'objective':
      return options((map?.objectives ?? []).map((objective) => ({ id: objective.id, label: objective.title || objective.id })))
    case 'objectiveStatus':
      return options(OBJECTIVE_STATUSES.map((id) => ({ id, label: id })))
    case 'challengeObject':
      return options((map ? challengeDefinitionsFor(map) : []).map((definition) => ({ id: definition.id, label: `${definition.name} (${definition.id})` })))
    case 'challengeState': {
      const definition = map ? challengeDefinitionsFor(map).find((entry) => entry.id === action.objectId) : null
      return options(Object.entries(definition?.states ?? {}).map(([id, state]) => ({ id, label: state.label ?? id })))
    }
    default:
      return <input className="ce-input ce-flag" value={value ?? ''} placeholder={field.label} onChange={(event) => set(event.target.value.trim())} />
  }
}

// actions: [{ type, ...fields }] (conversationActions.js ACTION_TYPES).
export function ActionsEditor({ actions, map, onChange }) {
  return (
    <div className="ce-list">
      {actions.map((action, index) => {
        const type = getActionType(action.type)
        return (
          <div key={index} className="ce-row is-action">
            <select className="ce-input" value={action.type} onChange={(event) => onChange(replaceAt(actions, index, getActionType(event.target.value).create()))}>
              {!type && <option value={action.type}>{action.type} (unknown)</option>}
              {ACTION_TYPES.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
            {type?.fields.map((field) => (
              <ActionField key={field.key} field={field} action={action} map={map} onChange={(next) => onChange(replaceAt(actions, index, next))} />
            ))}
            <button type="button" className="ce-button is-small" aria-label="Remove action" onClick={() => onChange(removeAt(actions, index))}>
              ×
            </button>
          </div>
        )
      })}
      <button type="button" className="ce-button is-small" onClick={() => onChange([...actions, ACTION_TYPES[0].create()])}>
        + Action
      </button>
    </div>
  )
}
