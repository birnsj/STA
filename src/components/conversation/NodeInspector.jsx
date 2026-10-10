import { ATTRIBUTE_IDS, DISCIPLINE_IDS, getAttributeName, getDisciplineName } from '../../character/runtimeCharacter.js'
import { createOption, nextId, nodeTypeLabel, outputsOf, withLink } from '../../conversation/conversationFormat.js'
import { MAX_COMPLICATION_RANGE } from '../../rules/taskResolver.js'
import { ActionsEditor, ConditionsEditor } from './ConversationFields.jsx'

// The conversation editor's inspector for the selected node: every field of its type, and where each output leads.

function Field({ label, children }) {
  return (
    <label className="ce-field">
      <span className="ce-field-label">{label}</span>
      {children}
    </label>
  )
}

// Where one output leads: any other node, or nowhere (the conversation ends there).
function LinkSelect({ nodes, value, selfId, onChange }) {
  return (
    <select className="ce-input" value={value ?? ''} onChange={(event) => onChange(event.target.value || null)}>
      <option value="">Nowhere (ends)</option>
      {nodes
        .filter((node) => node.id !== selfId)
        .map((node) => (
          <option key={node.id} value={node.id}>
            {node.id} · {nodeTypeLabel(node.type)}
          </option>
        ))}
    </select>
  )
}

function CheckFields({ node, map, update }) {
  return (
    <>
      <Field label="Label (shown to the player)">
        <input className="ce-input" value={node.label} placeholder="e.g. Request access" onChange={(event) => update({ label: event.target.value })} />
      </Field>
      <div className="ce-row">
        <Field label="Attribute">
          <select className="ce-input" value={node.attribute} onChange={(event) => update({ attribute: event.target.value })}>
            {ATTRIBUTE_IDS.map((id) => (
              <option key={id} value={id}>
                {getAttributeName(id)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Department">
          <select className="ce-input" value={node.department} onChange={(event) => update({ department: event.target.value })}>
            {DISCIPLINE_IDS.map((id) => (
              <option key={id} value={id}>
                {getDisciplineName(id)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="ce-row">
        <Field label="Difficulty">
          <input className="ce-input ce-number" type="number" min="0" max="5" value={node.difficulty} onChange={(event) => update({ difficulty: Math.max(0, Number(event.target.value) || 0) })} />
        </Field>
        <Field label="Complication range">
          <input
            className="ce-input ce-number"
            type="number"
            min="1"
            max={MAX_COMPLICATION_RANGE}
            value={node.complicationRange}
            onChange={(event) => update({ complicationRange: Math.min(MAX_COMPLICATION_RANGE, Math.max(1, Number(event.target.value) || 1)) })}
          />
        </Field>
      </div>
      <Field label="Focuses that apply (comma separated, exact names)">
        <input
          key={node.id}
          className="ce-input"
          defaultValue={node.focuses.join(', ')}
          placeholder="Persuasion, Diplomacy"
          onBlur={(event) => update({ focuses: event.target.value.split(',').map((focus) => focus.trim()).filter(Boolean) })}
        />
      </Field>
      <p className="ce-field-label">On a complication (once, if any remains after the roll)</p>
      <ActionsEditor actions={node.onComplication} map={map} onChange={(onComplication) => update({ onComplication })} />
    </>
  )
}

function ChoiceFields({ node, nodes, update }) {
  const setOption = (optionId, changes) => update({ options: node.options.map((option) => (option.id === optionId ? { ...option, ...changes } : option)) })
  return (
    <>
      {node.options.map((option, index) => (
        <div key={option.id} className="ce-option">
          <div className="ce-row">
            <span className="ce-field-label">Option {index + 1}</span>
            <button type="button" className="ce-button is-small" onClick={() => update({ options: node.options.filter((other) => other.id !== option.id) })}>
              Remove
            </button>
          </div>
          <textarea className="ce-input" rows={2} value={option.text} placeholder="What the player says" onChange={(event) => setOption(option.id, { text: event.target.value })} />
          <span className="ce-field-label">Shown only if</span>
          <ConditionsEditor conditions={option.conditions} onChange={(conditions) => setOption(option.id, { conditions })} />
          <Field label="Leads to">
            <LinkSelect nodes={nodes} value={option.next} selfId={node.id} onChange={(next) => setOption(option.id, { next })} />
          </Field>
        </div>
      ))}
      <button type="button" className="ce-button" onClick={() => update({ options: [...node.options, createOption(nextId('o', node.options))] })}>
        + Option
      </button>
    </>
  )
}

// node: the selected node; nodes: every node (link targets); onChange(node), onDelete(), onMakeStart().
export default function NodeInspector({ node, nodes, isStart, map, onChange, onDelete, onMakeStart }) {
  const update = (changes) => onChange({ ...node, ...changes })
  // Choice options pick their target inside their own block, so only other node types list outputs here.
  const outputs = node.type === 'choice' ? [] : outputsOf(node)
  return (
    <div className="ce-inspector">
      <div className="ce-row">
        <p className="ce-heading">
          {nodeTypeLabel(node.type)} · {node.id}
          {isStart ? ' · START' : ''}
        </p>
      </div>
      <div className="ce-row">
        {!isStart && (
          <button type="button" className="ce-button is-small" onClick={onMakeStart}>
            Make start
          </button>
        )}
        <button type="button" className="ce-button is-small" onClick={onDelete}>
          Delete node
        </button>
      </div>

      {node.type === 'npc' && (
        <>
          <Field label="Speaker (blank: the NPC's name)">
            <input className="ce-input" value={node.speaker} onChange={(event) => update({ speaker: event.target.value })} />
          </Field>
          <Field label="Line">
            <textarea className="ce-input" rows={5} value={node.text} onChange={(event) => update({ text: event.target.value })} />
          </Field>
        </>
      )}
      {node.type === 'choice' && <ChoiceFields node={node} nodes={nodes} update={update} />}
      {node.type === 'check' && <CheckFields node={node} map={map} update={update} />}
      {node.type === 'condition' && (
        <>
          <Field label="True when">
            <select className="ce-input" value={node.match} onChange={(event) => update({ match: event.target.value })}>
              <option value="all">every condition holds</option>
              <option value="any">any condition holds</option>
            </select>
          </Field>
          <ConditionsEditor conditions={node.conditions} onChange={(conditions) => update({ conditions })} />
        </>
      )}
      {node.type === 'action' && <ActionsEditor actions={node.actions} map={map} onChange={(actions) => update({ actions })} />}
      {node.type === 'end' && <p className="ce-text">The conversation closes here.</p>}

      {outputs.map((output) => (
        <Field key={output.key} label={output.label}>
          <LinkSelect nodes={nodes} value={output.target} selfId={node.id} onChange={(target) => onChange(withLink(node, output.key, target))} />
        </Field>
      ))}
    </div>
  )
}
