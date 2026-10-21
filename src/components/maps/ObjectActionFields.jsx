import { useState } from 'react'
import { ACTION_ICONS } from '../combat/actionIcons.js'
import { ConditionsEditor } from '../conversation/ConversationFields.jsx'
import attributeData from '../../data/source/attributes.json'
import disciplineData from '../../data/source/disciplines.json'
import { CHANGE_OPS, flagValueText, parseFlagValue } from '../../exploration/missionFlags.js'
import { RESPONSE_TYPES } from '../../maps/mapFormat.js'
import { EFFECT_TYPES, getEffectType, OUTCOME_LISTS } from '../../world/objectAuthoring.js'
import IdInput from './IdInput.jsx'

// The Object Editor's fields for one challenge-object action (challenges.json notes): what it is, when it's offered,
// its task, assists, combat cost and outcomes. object: the object it belongs to (its states and other actions).
const ATTRIBUTES = attributeData.attributes
const DEPARTMENTS = disciplineData.disciplines
const replaceAt = (list, index, item) => list.map((entry, at) => (at === index ? item : entry))
const removeAt = (list, index) => list.filter((_, at) => at !== index)
const withoutEmpty = (record) => Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined))

function Field({ label, children }) {
  return (
    <label className="ce-field">
      <span className="ce-field-label">{label}</span>
      {children}
    </label>
  )
}

function Choice({ value, options, onChange, blank, label }) {
  return (
    <select className="ce-input" value={value ?? ''} aria-label={label} onChange={(event) => onChange(event.target.value || undefined)}>
      {blank !== undefined && <option value="">{blank}</option>}
      {value && !options.some((option) => option.id === value) && <option value={value}>{value} (unknown)</option>}
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.name ?? option.label ?? option.id}
        </option>
      ))}
    </select>
  )
}

// A list of names typed with commas between; kept as typed until it changes, so a trailing comma isn't eaten.
function ListInput({ value = [], onChange, placeholder }) {
  const [text, setText] = useState(value.join(', '))
  return (
    <input
      className="ce-input"
      value={text}
      placeholder={placeholder}
      onChange={(event) => {
        setText(event.target.value)
        onChange(
          event.target.value
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean),
        )
      }}
    />
  )
}

function ValueInput({ value, onChange }) {
  return <input className="ce-input ce-value" value={flagValueText(value)} placeholder="true, 3, text" onChange={(event) => onChange(parseFlagValue(event.target.value))} />
}

const ADVANCED_KEYS = ['equipment', 'talentIds', 'roleIds', 'traitRules']
const WITHOUT_MODES = [
  { id: 'impossible', label: 'Impossible without it' },
  { id: 'difficulty', label: 'Harder without it' },
]

function EquipmentFields({ equipment, onChange }) {
  const value = equipment ?? { label: '', tags: [], without: undefined, bonus: [] }
  const set = (changes) => {
    const next = withoutEmpty({ ...value, ...changes })
    if (!next.label && !(next.tags?.length) && !(next.itemIds?.length) && next.without == null && !(next.bonus?.length)) {
      onChange(undefined)
      return
    }
    onChange(next)
  }
  const withoutMode = value.without === 'impossible' ? 'impossible' : value.without?.difficulty != null ? 'difficulty' : ''
  const bonuses = value.bonus ?? []
  return (
    <div className="ce-list">
      <span className="ce-field-label">Equipment (equipped items only)</span>
      <div className="ce-row">
        <Field label="Label">
          <input className="ce-input" value={value.label ?? ''} placeholder="e.g. a tricorder" onChange={(event) => set({ label: event.target.value })} />
        </Field>
        <Field label="Tags (commas)">
          <ListInput value={value.tags} onChange={(tags) => set({ tags: tags.length ? tags : undefined })} placeholder="scanner, engineering" />
        </Field>
        <Field label="Item ids (commas)">
          <ListInput value={value.itemIds} onChange={(itemIds) => set({ itemIds: itemIds.length ? itemIds : undefined })} placeholder="engineeringTricorder" />
        </Field>
      </div>
      <div className="ce-row">
        <label className="ce-toolbar-field">
          Without it
          <Choice
            label="Without it"
            value={withoutMode || undefined}
            options={WITHOUT_MODES}
            blank="No penalty (optional tool)"
            onChange={(mode) => {
              if (!mode) set({ without: undefined })
              else if (mode === 'impossible') set({ without: 'impossible' })
              else set({ without: { difficulty: value.without?.difficulty ?? 1 } })
            }}
          />
        </label>
        {withoutMode === 'difficulty' && (
          <label className="ce-toolbar-field">
            Extra Difficulty
            <input
              className="ce-input ce-number"
              type="number"
              min={1}
              max={5}
              value={value.without?.difficulty ?? 1}
              onChange={(event) => set({ without: { difficulty: Number(event.target.value) } })}
            />
          </label>
        )}
      </div>
      <span className="ce-field-label">Bonus tools (optional, Difficulty change when present)</span>
      {bonuses.map((bonus, index) => (
        <div key={index} className="ce-row is-action">
          <input
            className="ce-input"
            value={bonus.label ?? ''}
            placeholder="Label"
            onChange={(event) => onChange({ ...value, bonus: replaceAt(bonuses, index, { ...bonus, label: event.target.value }) })}
          />
          <ListInput
            value={bonus.tags}
            placeholder="tags"
            onChange={(tags) => onChange({ ...value, bonus: replaceAt(bonuses, index, withoutEmpty({ ...bonus, tags: tags.length ? tags : undefined })) })}
          />
          <ListInput
            value={bonus.itemIds}
            placeholder="item ids"
            onChange={(itemIds) => onChange({ ...value, bonus: replaceAt(bonuses, index, withoutEmpty({ ...bonus, itemIds: itemIds.length ? itemIds : undefined })) })}
          />
          <label className="ce-toolbar-field">
            Diff
            <input
              className="ce-input ce-number"
              type="number"
              value={bonus.difficulty ?? 0}
              onChange={(event) => onChange({ ...value, bonus: replaceAt(bonuses, index, { ...bonus, difficulty: Number(event.target.value) }) })}
            />
          </label>
          <button
            type="button"
            className="ce-button is-small"
            aria-label="Remove bonus"
            onClick={() => {
              const next = removeAt(bonuses, index)
              set({ bonus: next.length ? next : undefined })
            }}
          >
            ×
          </button>
        </div>
      ))}
      <button type="button" className="ce-button is-small" onClick={() => set({ bonus: [...bonuses, { label: '', difficulty: -1 }] })}>
        + Bonus tool
      </button>
      {(equipment || withoutMode || bonuses.length) && (
        <button type="button" className="ce-button is-small" onClick={() => onChange(undefined)}>
          Clear equipment
        </button>
      )}
    </div>
  )
}

function TraitRulesFields({ rules = [], onChange }) {
  return (
    <div className="ce-list">
      <span className="ce-field-label">Trait rules (scene / character traits)</span>
      {rules.map((rule, index) => (
        <div key={index} className="ce-row is-action">
          <input
            className="ce-input"
            value={rule.trait ?? ''}
            placeholder="Trait name"
            onChange={(event) => onChange(replaceAt(rules, index, { ...rule, trait: event.target.value }))}
          />
          <label className="ce-toolbar-field">
            <input
              type="checkbox"
              checked={Boolean(rule.impossible)}
              onChange={(event) =>
                onChange(replaceAt(rules, index, withoutEmpty({ trait: rule.trait, side: rule.side, ...(event.target.checked ? { impossible: true } : { difficulty: rule.difficulty ?? -1 }) })))
              }
            />
            Impossible
          </label>
          {!rule.impossible && (
            <label className="ce-toolbar-field">
              Diff
              <input
                className="ce-input ce-number"
                type="number"
                value={rule.difficulty ?? 0}
                onChange={(event) => onChange(replaceAt(rules, index, { ...rule, difficulty: Number(event.target.value), impossible: undefined }))}
              />
            </label>
          )}
          <Choice
            label="Side"
            value={rule.side}
            options={[
              { id: 'player', label: 'Player' },
              { id: 'enemy', label: 'Enemy' },
            ]}
            blank="Any side"
            onChange={(side) => onChange(replaceAt(rules, index, withoutEmpty({ ...rule, side })))}
          />
          <button type="button" className="ce-button is-small" aria-label="Remove trait rule" onClick={() => onChange(removeAt(rules, index))}>
            ×
          </button>
        </div>
      ))}
      <button type="button" className="ce-button is-small" onClick={() => onChange([...rules, { trait: '', difficulty: -1 }])}>
        + Trait rule
      </button>
    </div>
  )
}

// Escape hatch for the four advanced task keys only.
function AdvancedTaskJson({ task, onChange }) {
  const pick = () => Object.fromEntries(ADVANCED_KEYS.filter((key) => task[key] !== undefined).map((key) => [key, task[key]]))
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(() => (Object.keys(pick()).length ? JSON.stringify(pick(), null, 2) : ''))
  const [error, setError] = useState('')
  const apply = () => {
    try {
      const parsed = text.trim() ? JSON.parse(text) : {}
      const unknown = Object.keys(parsed).filter((key) => !ADVANCED_KEYS.includes(key))
      if (unknown.length) return setError(`Unknown: ${unknown.join(', ')}`)
      setError('')
      onChange({ ...Object.fromEntries(Object.entries(task).filter(([key]) => !ADVANCED_KEYS.includes(key))), ...parsed })
    } catch (failure) {
      setError(failure.message)
    }
  }
  return (
    <div className="ce-list">
      <button type="button" className="ce-button is-small" onClick={() => setOpen((value) => !value)}>
        {open ? 'Hide raw JSON' : 'Raw JSON (equipment / talents / roles / trait rules)'}
      </button>
      {open && (
        <Field label="Applied when you leave the box">
          <textarea
            className="ce-input"
            rows={4}
            value={text}
            spellCheck={false}
            onChange={(event) => setText(event.target.value)}
            onFocus={() => setText(Object.keys(pick()).length ? JSON.stringify(pick(), null, 2) : '')}
            onBlur={apply}
          />
          {error && <span className="ce-text is-warning">{error}</span>}
        </Field>
      )}
    </div>
  )
}

function AdvancedTask({ task, onChange }) {
  const set = (changes) => onChange(withoutEmpty({ ...task, ...changes }))
  return (
    <>
      <EquipmentFields equipment={task.equipment} onChange={(equipment) => set({ equipment })} />
      <Field label="Talent ids (comma list; only listed talents apply)">
        <ListInput value={task.talentIds} onChange={(talentIds) => set({ talentIds: talentIds.length ? talentIds : undefined })} placeholder="maintenanceSpecialist" />
      </Field>
      <Field label="Role ids (comma list)">
        <ListInput value={task.roleIds} onChange={(roleIds) => set({ roleIds: roleIds.length ? roleIds : undefined })} placeholder="chiefEngineer" />
      </Field>
      <TraitRulesFields rules={task.traitRules} onChange={(traitRules) => set({ traitRules: traitRules.length ? traitRules : undefined })} />
      <AdvancedTaskJson task={task} onChange={onChange} />
    </>
  )
}

function TaskFields({ task, onChange }) {
  const set = (changes) => onChange(withoutEmpty({ ...task, ...changes }))
  return (
    <>
      <div className="ce-row">
        <Choice label="Attribute" value={task.attribute} options={ATTRIBUTES} blank="Attribute…" onChange={(attribute) => set({ attribute })} />
        <Choice label="Department" value={task.department} options={DEPARTMENTS} blank="Department…" onChange={(department) => set({ department })} />
        <label className="ce-toolbar-field">
          Difficulty
          <input className="ce-input ce-number" type="number" min={0} max={5} value={task.difficulty ?? 0} onChange={(event) => set({ difficulty: Number(event.target.value) })} />
        </label>
        <label className="ce-toolbar-field">
          Complication range
          <input
            className="ce-input ce-number"
            type="number"
            min={1}
            max={5}
            value={task.complicationRange ?? ''}
            placeholder="1"
            onChange={(event) => set({ complicationRange: event.target.value === '' ? undefined : Number(event.target.value) })}
          />
        </label>
      </div>
      <Field label="Focuses (exact focus names, commas between)">
        <ListInput value={task.focuses} onChange={(focuses) => set({ focuses })} />
      </Field>
      <Field label="Tags (for species abilities, commas between)">
        <ListInput value={task.tags} onChange={(tags) => set({ tags: tags.length ? tags : undefined })} />
      </Field>
      <AdvancedTask task={task} onChange={onChange} />
    </>
  )
}

function AssistList({ assists, onChange }) {
  return (
    <div className="ce-list">
      {assists.map((assist, index) => (
        <div key={index} className="ce-row is-action">
          <input className="ce-input ce-wide" value={assist.label} placeholder="How they help" onChange={(event) => onChange(replaceAt(assists, index, { ...assist, label: event.target.value }))} />
          <Choice label="Attribute" value={assist.attribute} options={ATTRIBUTES} onChange={(attribute) => onChange(replaceAt(assists, index, { ...assist, attribute }))} />
          <Choice label="Department" value={assist.department} options={DEPARTMENTS} onChange={(department) => onChange(replaceAt(assists, index, { ...assist, department }))} />
          <ListInput value={assist.focuses} placeholder="focuses" onChange={(focuses) => onChange(replaceAt(assists, index, { ...assist, focuses }))} />
          <button type="button" className="ce-button is-small" aria-label="Remove assist" onClick={() => onChange(removeAt(assists, index))}>
            ×
          </button>
        </div>
      ))}
      <button type="button" className="ce-button is-small" onClick={() => onChange([...assists, { label: '', attribute: 'control', department: 'engineering', focuses: [] }])}>
        + Assist
      </button>
    </div>
  )
}

// requires.flags: { flag: value }, edited as rows kept here, so a row being typed never merges into another with the
// same name: only named rows are saved, and a name listed twice is shown (the last row counts, as in the file).
function RequiredFlags({ flags, onChange }) {
  const [rows, setRows] = useState(() => Object.entries(flags))
  const update = (next) => {
    setRows(next)
    onChange(Object.fromEntries(next.filter(([flag]) => flag)))
  }
  const repeated = (flag, index) => Boolean(flag) && rows.some(([other], at) => at > index && other === flag)
  return (
    <div className="ce-list">
      {rows.map(([flag, value], index) => (
        <div key={index} className="ce-row">
          <input
            className={`ce-input ce-flag${repeated(flag, index) ? ' is-invalid' : ''}`}
            value={flag}
            placeholder="flag"
            title={repeated(flag, index) ? 'Listed again below; that row counts' : undefined}
            onChange={(event) => update(replaceAt(rows, index, [event.target.value.trim(), value]))}
          />
          <span className="ce-text">=</span>
          <ValueInput value={value} onChange={(next) => update(replaceAt(rows, index, [flag, next]))} />
          <button type="button" className="ce-button is-small" aria-label="Remove flag" onClick={() => update(removeAt(rows, index))}>
            ×
          </button>
        </div>
      ))}
      <button type="button" className="ce-button is-small" onClick={() => setRows([...rows, ['', true]])}>
        + Flag
      </button>
    </div>
  )
}

function EffectField({ field, effect, object, onChange }) {
  const value = effect[field.key]
  const set = (next) => onChange(withoutEmpty({ ...effect, [field.key]: next }))
  switch (field.kind) {
    case 'number':
      return (
        <label className="ce-toolbar-field">
          {field.label}
          <input className="ce-input ce-number" type="number" step={field.step ?? 1} value={value ?? 0} onChange={(event) => set(Number(event.target.value))} />
        </label>
      )
    case 'boolean':
      return (
        <label className="ce-toolbar-field">
          <input type="checkbox" checked={Boolean(value)} onChange={(event) => set(event.target.checked)} />
          {field.label}
        </label>
      )
    case 'value':
      return effect.op === 'clear' ? null : <ValueInput value={value} onChange={set} />
    case 'flagOp':
      return <Choice label="Change" value={value} options={CHANGE_OPS} onChange={set} />
    case 'state':
      return <Choice label="State" value={value} options={Object.entries(object.states).map(([id, state]) => ({ id, label: state.label || id }))} onChange={set} />
    case 'action':
      return <Choice label="Action" value={value} blank="This action" options={object.actions.map((action) => ({ id: action.id, label: action.label || action.id }))} onChange={set} />
    case 'enum':
      return <Choice label={field.label ?? field.key} value={value} options={field.options ?? []} onChange={set} />
    case 'responseType':
      return (
        <Choice
          label={field.label ?? field.key}
          value={value ?? ''}
          options={RESPONSE_TYPES}
          blank="(clear / none)"
          onChange={(next) => set(next || null)}
        />
      )
    case 'longText':
      return <input className="ce-input oe-long" value={value ?? ''} placeholder="Text" onChange={(event) => set(event.target.value)} />
    case 'flag':
      return <input className="ce-input ce-flag" value={value ?? ''} placeholder={field.label ?? 'flag'} onChange={(event) => set(event.target.value.trim())} />
    default:
      return <input className="ce-input ce-flag" value={value ?? ''} placeholder={field.label} onChange={(event) => set(event.target.value)} />
  }
}

function EffectsEditor({ effects, object, onChange }) {
  return (
    <div className="ce-list">
      {effects.map((effect, index) => {
        const type = getEffectType(effect.type)
        return (
          <div key={index} className="ce-row is-action">
            <select className="ce-input" value={effect.type} aria-label="Effect" onChange={(event) => onChange(replaceAt(effects, index, getEffectType(event.target.value).create(object)))}>
              {!type && <option value={effect.type}>{effect.type} (unknown)</option>}
              {EFFECT_TYPES.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
            {type?.fields.map((field) => (
              <EffectField key={field.key} field={field} effect={effect} object={object} onChange={(next) => onChange(replaceAt(effects, index, next))} />
            ))}
            <button type="button" className="ce-button is-small" aria-label="Remove effect" onClick={() => onChange(removeAt(effects, index))}>
              ×
            </button>
          </div>
        )
      })}
      <button type="button" className="ce-button is-small" onClick={() => onChange([...effects, EFFECT_TYPES[0].create(object)])}>
        + Effect
      </button>
    </div>
  )
}

const ICONS = Object.keys(ACTION_ICONS).map((id) => ({ id }))
const COMBAT_COSTS = [
  { id: 'major', label: 'Major action' },
  { id: 'minor', label: 'Minor action' },
]

export default function ObjectActionFields({ action, object, onChange, onRename }) {
  const set = (changes) => onChange(withoutEmpty({ ...action, ...changes }))
  const requires = action.requires ?? {}
  const setRequires = (changes) => {
    const next = withoutEmpty({ ...requires, ...changes })
    set({ requires: Object.keys(next).length ? next : undefined })
  }
  const toggleState = (id, on) => {
    const states = on ? [...(requires.states ?? []), id] : (requires.states ?? []).filter((state) => state !== id)
    setRequires({ states: states.length ? states : undefined })
  }
  const listOrNothing = (list) => (list.length ? list : undefined)

  return (
    <div className="ce-inspector">
      <div className="ce-row">
        <Field label="Id">
          <IdInput value={action.id} label="Action id" taken={(next) => object.actions.some((other) => other.id === next)} onChange={onRename} />
        </Field>
        <Field label="Label (the ring and the log)">
          <input className="ce-input" value={action.label} onChange={(event) => set({ label: event.target.value })} />
        </Field>
        <Field label="Icon">
          <Choice label="Icon" value={action.icon} options={ICONS} blank="interact (default)" onChange={(icon) => set({ icon })} />
        </Field>
      </div>
      <Field label="Description">
        <textarea className="ce-input" rows={2} value={action.description ?? ''} onChange={(event) => set({ description: event.target.value })} />
      </Field>
      <div className="ce-row">
        <label className="ce-field is-inline">
          <input type="checkbox" checked={Boolean(action.routine)} onChange={(event) => set({ routine: event.target.checked || undefined, task: event.target.checked ? undefined : (action.task ?? { attribute: 'reason', department: 'engineering', difficulty: 1, focuses: [] }) })} />
          <span className="ce-field-label">Routine (simply works, no roll)</span>
        </label>
        <label className="ce-field is-inline">
          <input type="checkbox" checked={action.kind === 'createTrait'} onChange={(event) => set({ kind: event.target.checked ? 'createTrait' : undefined })} />
          <span className="ce-field-label">Create Trait</span>
        </label>
        <label className="ce-toolbar-field">
          In combat
          <Choice label="In combat" value={action.actionCost?.combat} options={COMBAT_COSTS} blank={action.routine ? 'Minor (default)' : 'Major (default)'} onChange={(combat) => set({ actionCost: withoutEmpty({ ...action.actionCost, combat }) })} />
        </label>
      </div>

      <span className="ce-heading">Offered when</span>
      <div className="ce-row">
        <span className="ce-field-label">Object state</span>
        {Object.entries(object.states).map(([id, state]) => (
          <label key={id} className="ce-toolbar-field">
            <input type="checkbox" checked={(requires.states ?? []).includes(id)} onChange={(event) => toggleState(id, event.target.checked)} />
            {state.label || id}
          </label>
        ))}
        {!requires.states?.length && <span className="ce-text">(any)</span>}
      </div>
      <span className="ce-field-label">Flags (each must equal)</span>
      <RequiredFlags flags={requires.flags ?? {}} onChange={(flags) => setRequires({ flags: Object.keys(flags).length ? flags : undefined })} />
      <span className="ce-field-label">Conditions (all hold)</span>
      <ConditionsEditor conditions={requires.conditions ?? []} onChange={(conditions) => setRequires({ conditions: listOrNothing(conditions) })} />
      <Field label="Locked hint (shown greyed on the ring with this reason when only the state matches; blank: hidden)">
        <input className="ce-input" value={action.lockedHint ?? ''} onChange={(event) => set({ lockedHint: event.target.value || undefined })} />
      </Field>

      {!action.routine && action.task && (
        <>
          <span className="ce-heading">Task</span>
          <TaskFields task={action.task} onChange={(task) => set({ task })} />
          <span className="ce-field-label">Assist (how a second party member may help; none: no assistance)</span>
          <AssistList assists={action.assist ?? []} onChange={(assist) => set({ assist: listOrNothing(assist) })} />
        </>
      )}

      <span className="ce-heading">Outcomes</span>
      {OUTCOME_LISTS.filter(({ key }) => !action.routine || key === 'always' || key === 'onSuccess').map(({ key, label }) => (
        <div key={key} className="ce-list">
          <span className="ce-field-label">{label}</span>
          <EffectsEditor effects={action[key] ?? []} object={object} onChange={(effects) => set({ [key]: listOrNothing(effects) })} />
        </div>
      ))}
    </div>
  )
}
