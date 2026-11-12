import { useState } from 'react'
import { getTile } from '../../maps/mapFormat.js'
import { getTemplatePiece } from '../../maps/templatePieces.js'
import {
  addWeightedEntry,
  normalizeWeightedEntries,
  removeWeightedEntry,
  setEntryWeight,
  weightedIds,
} from '../../maps/generators/weightedChoice.js'
import { tileThumbTitle, templatePieceThumbTitle } from './assetThumbTitle.js'
import { GE_ASSET_DRAG_TYPE, readGeAssetDrag } from './geAssetDrag.js'
import { contextMenuPlacement, GeThumbDeleteConfirm, GeThumbDeleteMenu } from './GeThumbContextMenu.jsx'
import TemplatePieceThumbnail from './TemplatePieceThumbnail.jsx'
import TileThumbnail from './TileThumbnail.jsx'

// Generator Editor role slot: shows only assigned tile(s). Drag from the left Palette to add; right-click to remove.
// weighted: value is [{ id, weight }, ...] with per-thumb % sliders (equal split on land, normalize to 100%).
export default function TileSpritePicker({
  label,
  hint = null,
  options,
  value,
  onChange,
  multi = false,
  weighted = false,
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
  const useWeights = Boolean(weighted)
  const useMulti = multi || useWeights
  const entries = useWeights ? normalizeWeightedEntries(value, { allowEmpty: true }) : null
  const selected = useWeights
    ? new Set(entries.map((entry) => entry.id))
    : useMulti
      ? new Set(value ?? [])
      : null
  const current = useMulti ? null : value || null
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

  const assignedIds = useWeights ? weightedIds(entries) : useMulti ? (value ?? []) : current ? [current] : []
  const assigned = assignedIds.map((id) => resolveAssigned(id)).filter(Boolean)

  const idAllowed = (id) => {
    if (!id) return false
    if (optionIds.has(id)) return true
    if (typeof acceptId === 'function') return acceptId(id)
    return false
  }

  const applyId = (id) => {
    if (disabled || !id) return
    if (useWeights) {
      if (selected.has(id)) return
      onChange(addWeightedEntry(entries, id))
      return
    }
    if (!useMulti) {
      onChange(id)
      return
    }
    if (selected.has(id)) return
    onChange([...(value ?? []), id])
  }

  const removeId = (id) => {
    if (disabled) return
    if (useWeights) {
      onChange(removeWeightedEntry(entries, id))
      return
    }
    if (useMulti) {
      if (!selected.has(id)) return
      onChange((value ?? []).filter((entry) => entry !== id))
      return
    }
    if (current === id) onChange(null)
  }

  const onWeight = (id, pct) => {
    if (disabled || !useWeights) return
    onChange(setEntryWeight(entries, id, Number(pct) / 100))
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

  const weightOf = (id) => entries?.find((entry) => entry.id === id)?.weight ?? 0

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
          {!useMulti && current && (
            <span className="ge-picker-current">
              {resolveAssigned(current)?.label ?? getTile(current)?.label ?? current}
            </span>
          )}
          {useMulti && <span className="ge-picker-current">{selected.size} selected</span>}
        </div>
      )}
      {hint && <p className="ce-text">{hint}</p>}
      <div className="ge-picker-grid" role={useMulti ? 'list' : 'group'} aria-label={label || 'Tiles'}>
        {allowNone && !useMulti && current == null && (
          <button type="button" className="ed-thumb-btn ge-thumb is-selected" disabled={disabled} title={noneLabel}>
            <span className="ge-thumb-none">{noneLabel}</span>
          </button>
        )}
        {assigned.map((tile) => {
          const piece = tile.__piece || getTemplatePiece(tile.id)
          const pct = useWeights ? Math.round(weightOf(tile.id) * 100) : null
          const title =
            typeof titleForTile === 'function'
              ? titleForTile(tile)
              : piece
                ? templatePieceThumbTitle(piece, { extra: `${piece.id} · right-click to remove` })
                : tileThumbTitle(tile, { extra: `${tile.id} · right-click to remove` })
          return (
            <div key={tile.id} className={`ge-thumb-slot${useWeights ? ' has-weight' : ''}`}>
              <button
                type="button"
                className="ed-thumb-btn ge-thumb is-selected"
                disabled={disabled}
                title={title}
                onContextMenu={(event) => onContextMenu(event, tile)}
              >
                {useMulti && !useWeights && (
                  <input type="checkbox" className="ge-thumb-check" checked readOnly tabIndex={-1} aria-hidden disabled={disabled} />
                )}
                {piece ? (
                  <TemplatePieceThumbnail piece={piece} className="me-thumb-preview" />
                ) : (
                  <TileThumbnail tile={tile} className="me-thumb-preview" animate={false} />
                )}
                <span className="ed-thumb-label">{tile.label}</span>
              </button>
              {useWeights && (
                <label className="ge-thumb-weight" onClick={(event) => event.stopPropagation()} onContextMenu={(event) => event.stopPropagation()}>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={pct}
                    disabled={disabled || assigned.length < 2}
                    aria-label={`${tile.label} mix percent`}
                    onChange={(event) => onWeight(tile.id, event.target.value)}
                  />
                  <span className="ge-thumb-weight-pct">{pct}%</span>
                </label>
              )}
            </div>
          )
        })}
        {!assigned.length && !(allowNone && !useMulti && current == null) && (
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
