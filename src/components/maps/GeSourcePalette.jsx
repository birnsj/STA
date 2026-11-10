import { useMemo, useState } from 'react'
import { getTile } from '../../maps/mapFormat.js'
import { setGeAssetDrag } from './geAssetDrag.js'
import TileThumbnail from './TileThumbnail.jsx'

const THUMB_COLS = 3

/**
 * Left-rail source palette for Generator Editor (same chrome as Map Editor Assets).
 * items: [{ kind: 'tile'|'piece', id, label, href? }]
 */
export default function GeSourcePalette({ title = 'Palette', hint = null, items = [] }) {
  const hasPieces = items.some((item) => item.kind === 'piece')
  const hasTiles = items.some((item) => item.kind === 'tile')
  const [tab, setTab] = useState(() => (hasTiles ? 'tiles' : 'pieces'))
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()

  const visible = useMemo(() => {
    const kind = hasPieces && hasTiles ? (tab === 'pieces' ? 'piece' : 'tile') : null
    return items.filter((item) => {
      if (kind && item.kind !== kind) return false
      if (!q) return true
      return item.label.toLowerCase().includes(q) || item.id.toLowerCase().includes(q)
    })
  }, [items, tab, q, hasPieces, hasTiles])

  const activeTab = hasPieces && hasTiles ? tab : hasPieces ? 'pieces' : 'tiles'

  return (
    <aside className="ed-assets me-palette ge-source-rail" style={{ '--ed-thumb-cols': THUMB_COLS }}>
      <div className="ed-panel-head">
        <span>{title}</span>
      </div>
      {hasPieces && hasTiles ? (
        <div className="ed-asset-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            className={`ed-tab${activeTab === 'tiles' ? ' is-active' : ''}`}
            aria-selected={activeTab === 'tiles'}
            onClick={() => setTab('tiles')}
          >
            Tiles
          </button>
          <button
            type="button"
            role="tab"
            className={`ed-tab${activeTab === 'pieces' ? ' is-active' : ''}`}
            aria-selected={activeTab === 'pieces'}
            onClick={() => setTab('pieces')}
          >
            Pieces
          </button>
        </div>
      ) : null}
      <div className="ed-asset-tools">
        <input
          className="ed-asset-search me-name"
          type="search"
          value={query}
          placeholder="Search…"
          aria-label="Search palette"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {hint ? <p className="ge-source-hint">{hint}</p> : null}
      <div className="ed-asset-body">
        <div className="ed-asset-grid" role="list">
          {visible.map((item) => {
            const tile = item.kind === 'tile' ? getTile(item.id) : null
            return (
              <div key={`${item.kind}:${item.id}`} className="ed-asset-cell">
                <button
                  type="button"
                  className="ed-thumb-btn ge-source-thumb"
                  title={`Drag ${item.label} onto a slot`}
                  draggable
                  onDragStart={(event) => setGeAssetDrag(event, item.kind, item.id)}
                >
                  {item.kind === 'tile' && tile ? (
                    <TileThumbnail tile={tile} className="me-thumb-preview" animate={false} />
                  ) : (
                    <img className="me-thumb-preview ge-piece-thumb" src={item.href} alt="" draggable={false} />
                  )}
                </button>
                <span className="ed-thumb-label">{item.label}</span>
              </div>
            )
          })}
        </div>
        {!visible.length && <p className="ce-text ge-picker-empty">Nothing in this palette.</p>}
      </div>
    </aside>
  )
}
