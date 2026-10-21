import { DISPOSITION_IDS, ACTION_TYPES, getActionType } from '../../conversation/conversationActions.js'
import { getNpcProperty, NPC_PROPERTIES } from '../../conversation/conversationScope.js'
import { challengeDefinitionsFor } from '../../exploration/challengeObjects.js'
import { CHANGE_OPS, CONDITION_OPS, flagValueText, OBJECTIVE_STATUSES, parseFlagValue } from '../../exploration/missionFlags.js'

// Editors for the parts of a conversation node that are lists of small objects: flag conditions and actions
// (conversationActions.js). map: the map open in the editor, for the objective and challenge object pickers.

const replaceAt = (list, index, item) => list.map((entry, at) => (at === index ? item : entry))
const removeAt = (list, index) => list.filter((_, at) => at !== index)

function ValueInput({ value, onChange, placeholder = 'true, 3, text' }) {
  return <input className="ce-input ce-value" value={flagValueText(value)} placeholder={placeholder} onChange={(event) => onChange(parseFlagValue(event.target.value))} />
}

// The condition as it reads when the source changes: a flag, or one of the talking NPC's properties.
const FLAG_SOURCE = 'flag'
const withSource = (condition, source) => (source === FLAG_SOURCE ? { flag: '', op: condition.op } : { npc: source, op: getNpcProperty(source)?.kind === 'boolean' ? 'isTrue' : 'equals', value: getNpcProperty(source)?.kind === 'number' ? 0 : getNpcProperty(source)?.kind === 'disposition' ? 'neutral' : undefined })

// conditions: [{ flag, op, value } | { npc, op, value }] (missionFlags.js; conversationScope.js for an NPC property).
export function ConditionsEditor({ conditions, onChange }) {
  return (
    <div className="ce-list">
      {conditions.map((condition, index) => {
        const op = CONDITION_OPS.find((entry) => entry.id === condition.op) ?? CONDITION_OPS[0]
        const source = condition.npc ?? FLAG_SOURCE
        return (
          <div key={index} className="ce-row">
            <select className="ce-input" value={source} aria-label="What the condition reads" onChange={(event) => onChange(replaceAt(conditions, index, withSource(condition, event.target.value)))}>
              <option value={FLAG_SOURCE}>Flag</option>
              {NPC_PROPERTIES.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.label}
                </option>
              ))}
            </select>
            {!condition.npc && <input className="ce-input ce-flag" value={condition.flag} placeholder="flag ({npc} / {group} allowed)" onChange={(event) => onChange(replaceAt(conditions, index, { ...condition, flag: event.target.value.trim() }))} />}
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
    <select className="ce-input" value={value ?? ''} title={field.label} aria-label={field.label} onChange={(event) => set(event.target.value)}>
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
      return <input className="ce-input ce-number" type="number" value={value ?? 0} title={field.label} aria-label={field.label} onChange={(event) => set(Number(event.target.value))} />
    case 'optionalNumber':
      return <input className="ce-input ce-number" type="number" min="0" value={value ?? ''} placeholder="auto" title={field.label} aria-label={field.label} onChange={(event) => set(event.target.value === '' ? null : Number(event.target.value))} />
    case 'boolean':
      return (
        <label className="ce-check">
          <input type="checkbox" checked={Boolean(value)} onChange={(event) => set(event.target.checked)} /> {field.label}
        </label>
      )
    case 'select':
      return options(field.options ?? [])
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
      return <input className="ce-input ce-flag" value={value ?? ''} placeholder={field.label} title={field.label} onChange={(event) => set(event.target.value.trim())} />
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
