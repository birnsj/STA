import { useState } from 'react'
import {
  addWeightedEntry,
  normalizeWeightedEntries,
  removeWeightedEntry,
  setEntryWeight,
  weightedIds,
} from '../../maps/generators/weightedChoice.js'
import { getTemplatePiece } from '../../maps/templatePieces.js'
import { templatePieceThumbTitle } from './assetThumbTitle.js'
import { GE_ASSET_DRAG_TYPE, readGeAssetDrag } from './geAssetDrag.js'
import { contextMenuPlacement, GeThumbDeleteConfirm, GeThumbDeleteMenu } from './GeThumbContextMenu.jsx'
import TemplatePieceThumbnail from './TemplatePieceThumbnail.jsx'

// Generator Editor Template Piece role slot: assigned pieces only. Drag from Palette to add; right-click to remove.
// weighted: value is [{ id, weight }, ...] with per-thumb % sliders.
export default function TemplatePieceSpritePicker({
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
  emptyText = 'Drop a piece from the Palette.',
  acceptDrop = true,
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
  const currentDef = !useMulti && current ? getTemplatePiece(current) : null
  const [dropOver, setDropOver] = useState(false)
  const [menu, setMenu] = useState(null)
  const [pending, setPending] = useState(null)
  const optionIds = new Set(options.map((piece) => piece.id))

  const assignedIds = useWeights ? weightedIds(entries) : useMulti ? (value ?? []) : current ? [current] : []
  const assigned = assignedIds
    .map((id) => options.find((piece) => piece.id === id) || getTemplatePiece(id))
    .filter(Boolean)

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

  const onContextMenu = (event, piece) => {
    event.preventDefault()
    event.stopPropagation()
    if (disabled) return
    const placement = contextMenuPlacement(event)
    if (!placement) return
    setPending(null)
    setMenu({ ...placement, id: piece.id, label: piece.label })
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
    if (!asset || asset.kind !== 'piece') return
    if (!optionIds.has(asset.id)) return
    applyId(asset.id)
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
          {!useMulti && currentDef && <span className="ge-picker-current">{currentDef.label}</span>}
          {useMulti && <span className="ge-picker-current">{selected.size} selected</span>}
        </div>
      )}
      {hint && <p className="ce-text">{hint}</p>}
      <div className="ge-picker-grid" role={useMulti ? 'list' : 'group'} aria-label={label || 'Template pieces'}>
        {allowNone && !useMulti && current == null && (
          <button type="button" className="ed-thumb-btn ge-thumb is-selected" disabled={disabled} title={noneLabel}>
            <span className="ge-thumb-none">{noneLabel}</span>
          </button>
        )}
        {assigned.map((piece) => {
          const pct = useWeights ? Math.round(weightOf(piece.id) * 100) : null
          return (
            <div key={piece.id} className={`ge-thumb-slot${useWeights ? ' has-weight' : ''}`}>
              <button
                type="button"
                className="ed-thumb-btn ge-thumb is-selected"
                disabled={disabled}
                title={templatePieceThumbTitle(piece, { extra: `${piece.id} · right-click to remove` })}
                onContextMenu={(event) => onContextMenu(event, piece)}
              >
                {useMulti && !useWeights && (
                  <input type="checkbox" className="ge-thumb-check" checked readOnly tabIndex={-1} aria-hidden disabled={disabled} />
                )}
                <TemplatePieceThumbnail piece={piece} className="me-thumb-preview" />
                <span className="ed-thumb-label">{piece.label}</span>
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
                    aria-label={`${piece.label} mix percent`}
                    onChange={(event) => onWeight(piece.id, event.target.value)}
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
