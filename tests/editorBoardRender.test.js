// Renders the map editor's board (server-side, no WebGL) so a render-time crash fails a test instead of the editor.
// Regression: selecting a destructible threw "Cannot access 'layerShown' before initialization".
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { createServer } from 'vite'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'

describe('EditorBoard render', () => {
  let server
  let EditorBoard
  let mapWithDestructible
  let destructibleId

  before(async () => {
    server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })
    ;({ default: EditorBoard } = await server.ssrLoadModule('/src/components/maps/EditorBoard.jsx'))
    const { createBlankMap } = await server.ssrLoadModule('/src/maps/mapFormat.js')
    const { placeDestructible } = await server.ssrLoadModule('/src/maps/mapEdits.js')
    const placed = placeDestructible(createBlankMap({ name: 'Test', width: 8, height: 8 }), { x: 3, y: 3 }, 'epsConduit', [])
    mapWithDestructible = placed.map
    destructibleId = placed.object.id
  })

  after(async () => {
    await server?.close()
  })

  const props = (extra = {}) => ({ map: mapWithDestructible, ghostBlocks: false, brush: null, rotated: false, onHover() {}, onPaint() {}, ...extra })

  it('renders with nothing selected', () => {
    assert.doesNotThrow(() => renderToString(createElement(EditorBoard, props())))
  })

  it('renders with a destructible selected', () => {
    assert.doesNotThrow(() => renderToString(createElement(EditorBoard, props({ selectedDestructibleId: destructibleId }))))
  })

  it('renders a selected destructible while its layer is hidden', () => {
    const layerVisibility = { ground: true, walls: true, furniture: false, characters: true, markers: true }
    assert.doesNotThrow(() => renderToString(createElement(EditorBoard, props({ selectedDestructibleId: destructibleId, layerVisibility }))))
  })
})
