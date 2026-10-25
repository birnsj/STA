import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { createServer } from 'vite'
import { createBlankMap } from '../src/maps/mapFormat.js'

function findElement(node, predicate) {
  if (!node) return null
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, predicate)
      if (found) return found
    }
    return null
  }
  if (predicate(node)) return node
  return findElement(node.props?.children, predicate)
}

let server
let HazardInspector
let DestructibleInspector
let EditorInspectors

before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })
  ;({ default: HazardInspector } = await server.ssrLoadModule('/src/components/maps/HazardInspector.jsx'))
  ;({ default: DestructibleInspector } = await server.ssrLoadModule('/src/components/maps/DestructibleInspector.jsx'))
  ;({ default: EditorInspectors } = await server.ssrLoadModule('/src/components/maps/EditorInspectors.jsx'))
})

after(async () => server?.close())

describe('map inspectors with unknown authored types', () => {
  it('renders a safe hazard state', () => {
    const html = renderToString(
      createElement(HazardInspector, {
        region: { id: 'h1', type: 'futureHazard', tiles: { '1,1': 2 } },
        onChange() {},
        onDelete() {},
      }),
    )
    assert.match(html, /Unknown hazard type/)
    assert.match(html, /futureHazard/)
  })

  it('renders a safe destructible state', () => {
    const html = renderToString(
      createElement(DestructibleInspector, {
        object: { id: 'd1', type: 'futureObject', position: { x: 1, y: 1 } },
        onChange() {},
        onMove() {},
        onLink() {},
        onDuplicate() {},
        onDelete() {},
      }),
    )
    assert.match(html, /Unknown destructible type/)
    assert.match(html, /futureObject/)
  })
})

describe('ground item inspector movement', () => {
  const mapWithStack = () => {
    const map = createBlankMap({ width: 6, height: 6 })
    return {
      ...map,
      groundItemPlacements: [
        { id: 'parent', itemId: 'medkit', position: { x: 1.25, y: 1.25 } },
        { id: 'child', itemId: 'hypospray', position: { x: 1.25, y: 1.25 }, on: { placement: 'parent' } },
        { id: 'grandchild', itemId: 'autosuture', position: { x: 1.25, y: 1.25 }, on: { placement: 'child' } },
      ],
    }
  }

  const inspectorFor = (map, edit, locked = false) => {
    const parent = map.groundItemPlacements[0]
    const tree = EditorInspectors({
      map,
      edit,
      tool: 'items',
      conversations: [],
      selection: { npc: null, object: null, marker: null, destructible: null, hazard: null, groundItem: parent },
      onToggleGroundItemMove() {},
      onDuplicateGroundItem() {},
      onGroundItemCleared() {},
      layers: { visible: { furniture: true }, locked: { furniture: locked } },
    })
    return findElement(tree, (element) => element.props?.object?.id === parent.id && typeof element.props?.onPositionChange === 'function')
  }

  it('routes coordinate edits through the complete support-subtree transaction', () => {
    const map = mapWithStack()
    let edited = null
    const inspector = inspectorFor(map, (next) => { edited = next })
    assert.ok(inspector)
    inspector.props.onPositionChange({ x: 3.25, y: 2.25 })
    const movedPosition = edited.groundItemPlacements[0].position
    assert.deepEqual(edited.groundItemPlacements.map((entry) => entry.position), [
      movedPosition,
      movedPosition,
      movedPosition,
    ])
    assert.deepEqual(edited.groundItemPlacements[1].on, { placement: 'parent' })
    assert.deepEqual(edited.groundItemPlacements[2].on, { placement: 'child' })
  })

  it('rejects inspector movement while the furniture layer is locked', () => {
    const map = mapWithStack()
    let edits = 0
    const inspector = inspectorFor(map, () => { edits += 1 }, true)
    inspector.props.onPositionChange({ x: 3.25, y: 2.25 })
    assert.equal(edits, 0)
  })
})
