import { useRef } from 'react'
import { getAttributeName, getDisciplineName } from '../../character/runtimeCharacter.js'
import { describeAction } from '../../conversation/conversationActions.js'
import { nodeTypeLabel, outputsOf } from '../../conversation/conversationFormat.js'

// The conversation editor's node graph: nodes are boxes placed at their editor positions (drag a node by its title);
// each output is a port on its right edge, drawn as a curve to the node it leads to. Click a port, then a node, to
// connect them. Every size is fixed in CSS terms here so the ports line up without measuring the DOM.
export const NODE_WIDTH = 220
const HEADER = 26
const BODY = 44
const ROW = 22
const GRID = 10
const MARGIN = 400

const portY = (node, index) => node.position.y + HEADER + BODY + ROW * index + ROW / 2
const conditionText = (condition) => `${condition.flag || '?'} ${condition.op}${condition.value !== undefined && !['isTrue', 'isFalse'].includes(condition.op) ? ` ${condition.value}` : ''}`

function summary(node) {
  switch (node.type) {
    case 'npc':
      return node.text || '(no text)'
    case 'choice':
      return `${node.options.length} option${node.options.length === 1 ? '' : 's'}`
    case 'check':
      return `${node.label ? `${node.label}: ` : ''}${getAttributeName(node.attribute)} + ${getDisciplineName(node.department)}, Difficulty ${node.difficulty}`
    case 'condition':
      return node.conditions.length ? node.conditions.map(conditionText).join(node.match === 'any' ? ' or ' : ' and ') : '(no conditions: always true)'
    case 'action':
      return node.actions.length ? node.actions.map(describeAction).join('; ') : '(no actions)'
    default:
      return 'The conversation closes.'
  }
}

function Link({ from, to, kind }) {
  const bend = Math.max(40, Math.abs(to.x - from.x) / 2)
  return <path className={`ce-link is-${kind}`} d={`M ${from.x} ${from.y} C ${from.x + bend} ${from.y}, ${to.x - bend} ${to.y}, ${to.x} ${to.y}`} />
}

// connecting: { nodeId, key } while a port waits for its target, or null.
export default function ConversationCanvas({ conversation, selectedId, connecting, onSelect, onMove, onConnect, onLink }) {
  const drag = useRef(null)
  const nodesById = new Map(conversation.nodes.map((node) => [node.id, node]))
  const width = Math.max(0, ...conversation.nodes.map((node) => node.position.x)) + NODE_WIDTH + MARGIN
  const height = Math.max(0, ...conversation.nodes.map((node) => node.position.y + HEADER + BODY + ROW * outputsOf(node).length)) + MARGIN

  const startDrag = (event, node) => {
    if (event.button !== 0) return
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { id: node.id, startX: event.clientX, startY: event.clientY, origin: node.position }
    onSelect(node.id)
  }
  const moveDrag = (event) => {
    const current = drag.current
    if (!current) return
    const x = Math.max(0, Math.round((current.origin.x + event.clientX - current.startX) / GRID) * GRID)
    const y = Math.max(0, Math.round((current.origin.y + event.clientY - current.startY) / GRID) * GRID)
    onMove(current.id, { x, y })
  }
  const endDrag = () => (drag.current = null)

  const links = conversation.nodes.flatMap((node) =>
    outputsOf(node)
      .map((output, index) => ({ node, output, index, target: nodesById.get(output.target) }))
      .filter((entry) => entry.target)
      .map(({ node: from, output, index, target }) => (
        <Link
          key={`${from.id}:${output.key}`}
          from={{ x: from.position.x + NODE_WIDTH, y: portY(from, index) }}
          to={{ x: target.position.x, y: target.position.y + HEADER / 2 }}
          kind={output.key.startsWith('option:') ? 'option' : output.key}
        />
      )),
  )

  return (
    <div className={`ce-canvas${connecting ? ' is-connecting' : ''}`} onPointerDown={() => onSelect(null)}>
      <div className="ce-world" style={{ width, height }}>
        <svg className="ce-links" width={width} height={height}>
          {links}
        </svg>
        {conversation.nodes.map((node) => {
          const outputs = outputsOf(node)
          return (
            <div
              key={node.id}
              className={`ce-node is-${node.type}${node.id === selectedId ? ' is-selected' : ''}${node.id === conversation.start ? ' is-start' : ''}`}
              style={{ left: node.position.x, top: node.position.y, width: NODE_WIDTH }}
              onPointerDown={(event) => {
                event.stopPropagation()
                if (connecting) onLink(node.id)
                else onSelect(node.id)
              }}
            >
              <div className="ce-node-header" style={{ height: HEADER }} onPointerDown={(event) => (connecting ? undefined : startDrag(event, node))} onPointerMove={moveDrag} onPointerUp={endDrag}>
                <span className="ce-node-type">{nodeTypeLabel(node.type)}</span>
                <span className="ce-node-id">
                  {node.id === conversation.start ? 'START · ' : ''}
                  {node.id}
                </span>
              </div>
              <div className="ce-node-body" style={{ height: BODY }}>
                {summary(node)}
              </div>
              {outputs.map((output) => (
                <div key={output.key} className="ce-node-output" style={{ height: ROW }}>
                  <span className="ce-output-label">{output.label}</span>
                  <button
                    type="button"
                    className={`ce-port${output.target ? ' is-linked' : ''}${connecting?.nodeId === node.id && connecting.key === output.key ? ' is-active' : ''}`}
                    title={output.target ? `Leads to ${output.target}. Click, then click another node to change it.` : 'Click, then click the node it leads to.'}
                    onPointerDown={(event) => {
                      event.stopPropagation()
                      onConnect(connecting?.nodeId === node.id && connecting.key === output.key ? null : { nodeId: node.id, key: output.key })
                    }}
                  />
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
