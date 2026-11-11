import { useState } from 'react'
import { getTile } from '../../maps/mapFormat.js'
import { getTemplatePiece } from '../../maps/templatePieces.js'
import { tileThumbTitle, templatePieceThumbTitle } from './assetThumbTitle.js'
import { GE_ASSET_DRAG_TYPE, readGeAssetDrag } from './geAssetDrag.js'
import { contextMenuPlacement, GeThumbDeleteConfirm, GeThumbDeleteMenu } from './GeThumbContextMenu.jsx'
import TemplatePieceThumbnail from './TemplatePieceThumbnail.jsx'
import TileThumbnail from './TileThumbnail.jsx'

// Generator Editor role slot: shows only assigned tile(s). Drag from the left Palette to add; right-click to remove.
export default function TileSpritePicker({
  label,
  hint = null,
  options,
  value,
  onChange,
  multi = false,
  allowNone = false,
  noneLabel = 'None',
  disabled = false,
  emptyText = 'Drop a tile from the Palette.',
  acceptDrop = true,
  /** Optional: map a dropped asset (e.g. Template Piece) to a tile id before optionIds check. */
  resolveDropId = null,
  /** Optional: custom hover title for an assigned tile (defaults to tileThumbTitle). */
  titleForTile = null,
  /** Optional: allow ids beyond `options` (e.g. Template Piece ids kept by Auto-Paint). */
  acceptId = null,
}) {
  const selected = multi ? new Set(value ?? []) : null
  const current = multi ? null : value || null
  const [dropOver, setDropOver] = useState(false)
  const [menu, setMenu] = useState(null)
  const [pending, setPending] = useState(null)
  const optionIds = new Set(options.map((tile) => tile.id))

  const resolveAssigned = (id) => {
    if (!id) return null
    const fromOptions = options.find((tile) => tile.id === id)
    if (fromOptions) return fromOptions
    const tile = getTile(id)
    if (tile) return tile
    const piece = getTemplatePiece(id)
    if (piece) return { id: piece.id, label: piece.label, __piece: piece }
    return null
  }

  const assigned = multi
    ? (value ?? []).map((id) => resolveAssigned(id)).filter(Boolean)
    : current
      ? [resolveAssigned(current)].filter(Boolean)
      : []

  const idAllowed = (id) => {
    if (!id) return false
    if (optionIds.has(id)) return true
    if (typeof acceptId === 'function') return acceptId(id)
    return false
  }

  const applyId = (id) => {
    if (disabled || !id) return
    if (!multi) {
      onChange(id)
      return
    }
    if (selected.has(id)) return
    onChange([...(value ?? []), id])
  }

  const removeId = (id) => {
    if (disabled) return
    if (multi) {
      if (!selected.has(id)) return
      onChange((value ?? []).filter((entry) => entry !== id))
      return
    }
    if (current === id) onChange(null)
  }

  const onContextMenu = (event, tile) => {
    event.preventDefault()
    event.stopPropagation()
    if (disabled) return
    const placement = contextMenuPlacement(event)
    if (!placement) return
    setPending(null)
    setMenu({ ...placement, id: tile.id, label: tile.label })
  }

  const onDragOver = (event) => {
    if (disabled || !acceptDrop) return
    const types = event.dataTransfer?.types
    if (!types || ![...types].includes(GE_ASSET_DRAG_TYPE)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setDropOver(true)
  }

  const onDragLeave = (event) => {
    if (event.currentTarget.contains(event.relatedTarget)) return
    setDropOver(false)
  }

  const onDrop = (event) => {
    setDropOver(false)
    if (disabled || !acceptDrop) return
    event.preventDefault()
    const asset = readGeAssetDrag(event)
    if (!asset) return
    let id = null
    if (typeof resolveDropId === 'function') id = resolveDropId(asset)
    else if (asset.kind === 'tile') id = asset.id
    if (!idAllowed(id)) return
    applyId(id)
  }

  return (
    <div
      className={`ge-picker${disabled ? ' is-disabled' : ''}${dropOver ? ' is-drop-target' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {label && (
        <div className="ge-picker-head">
          <span className="ce-field-label">{label}</span>
          {!multi && current && (
            <span className="ge-picker-current">
              {resolveAssigned(current)?.label ?? getTile(current)?.label ?? current}
            </span>
          )}
          {multi && <span className="ge-picker-current">{selected.size} selected</span>}
        </div>
      )}
      {hint && <p className="ce-text">{hint}</p>}
      <div className="ge-picker-grid" role={multi ? 'list' : 'group'} aria-label={label || 'Tiles'}>
        {allowNone && !multi && current == null && (
          <button type="button" className="ed-thumb-btn ge-thumb is-selected" disabled={disabled} title={noneLabel}>
            <span className="ge-thumb-none">{noneLabel}</span>
          </button>
        )}
        {assigned.map((tile) => {
          const piece = tile.__piece || getTemplatePiece(tile.id)
          const title =
            typeof titleForTile === 'function'
              ? titleForTile(tile)
              : piece
                ? templatePieceThumbTitle(piece, { extra: `${piece.id} · right-click to remove` })
                : tileThumbTitle(tile, { extra: `${tile.id} · right-click to remove` })
          return (
          <button
            key={tile.id}
            type="button"
            className="ed-thumb-btn ge-thumb is-selected"
            disabled={disabled}
            title={title}
            onContextMenu={(event) => onContextMenu(event, tile)}
          >
            {multi && (
              <input type="checkbox" className="ge-thumb-check" checked readOnly tabIndex={-1} aria-hidden disabled={disabled} />
            )}
            {piece ? (
              <TemplatePieceThumbnail piece={piece} className="me-thumb-preview" />
            ) : (
              <TileThumbnail tile={tile} className="me-thumb-preview" animate={false} />
            )}
            <span className="ed-thumb-label">{tile.label}</span>
          </button>
          )
        })}
        {!assigned.length && !(allowNone && !multi && current == null) && (
          <p className="ce-text ge-picker-empty">{emptyText}</p>
        )}
      </div>
      {menu && (
        <GeThumbDeleteMenu
          x={menu.x}
          y={menu.y}
          host={menu.host}
          onClose={() => setMenu(null)}
          onDelete={() => {
            setPending({ id: menu.id, label: menu.label, host: menu.host })
            setMenu(null)
          }}
        />
      )}
      {pending && (
        <GeThumbDeleteConfirm
          label={pending.label}
          host={pending.host}
          onCancel={() => setPending(null)}
          onConfirm={() => {
            removeId(pending.id)
            setPending(null)
          }}
        />
      )}
    </div>
  )
}
