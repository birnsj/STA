import { getTemplatePiece, templatePieceArt } from '../../maps/templatePieces.js'
import { TemplatePieceDetails } from './AssetProperties.jsx'
import { PropertySection } from './PropertySections.jsx'
import TemplatePieceThumbnail from './TemplatePieceThumbnail.jsx'

// Map editor panel for an authored Template Piece overlay (mapFormat.js templatePiecePlacements).
export default function TemplatePieceInspector({
  object,
  moving,
  onChange,
  onPositionChange,
  onMove,
  onDelete,
  animateTiles = true,
  ambient,
  ambientColour,
  onAmbient,
  onAmbientColour,
  onStatus = null,
}) {
  const def = getTemplatePiece(object.pieceId)
  const art = templatePieceArt(def, object.rotation ?? 0)
  const preview = def
    ? { ...def, href: art?.href ?? def.href, animation: art?.animation ?? def.animation }
    : null
  const pos = object.position
  const commitCoord = (axis, raw) => {
    const n = Number(raw)
    if (!Number.isFinite(n)) return
    onPositionChange({ ...pos, [axis]: n })
  }
  const stepRotation = (delta) => {
    const next = (((Number(object.rotation) || 0) + delta) % 360 + 360) % 360
    onChange({ rotation: next })
  }
  return (
    <div className="ed-asset-props">
      <PropertySection id="template-piece" title="Template Piece">
        <div className="ed-asset-preview">
          {preview && (
            <TemplatePieceThumbnail piece={preview} className="ed-asset-preview-art" large animate={animateTiles} />
          )}
        </div>
        <p className="me-text">
          <strong>{def?.label ?? object.pieceId}</strong>
        </p>
        <p className="me-text">
          Instance ID: <strong>{object.id}</strong>
        </p>
        <p className="me-text">Visual overlay only — pathing and sight use the deck underlay.</p>
      </PropertySection>
      <PropertySection id="template-placement" title="Placement">
        <label className="me-field">
          Position X
          <input
            className="me-name me-wide"
            type="number"
            step={0.03125}
            defaultValue={pos.x}
            key={`x-${object.id}-${pos.x}`}
            onBlur={(event) => commitCoord('x', event.target.value)}
          />
        </label>
        <label className="me-field">
          Position Y
          <input
            className="me-name me-wide"
            type="number"
            step={0.03125}
            defaultValue={pos.y}
            key={`y-${object.id}-${pos.y}`}
            onBlur={(event) => commitCoord('y', event.target.value)}
          />
        </label>
        <label className="me-field">
          Rotation
          <span className="me-actions">
            <button type="button" className="me-button" onClick={() => stepRotation(-90)} title="Rotate −90°">
              ↺
            </button>
            <input
              className="me-name"
              type="number"
              step={90}
              value={object.rotation ?? 0}
              onChange={(event) => onChange({ rotation: Number(event.target.value) || 0 })}
            />
            <button type="button" className="me-button" onClick={() => stepRotation(90)} title="Rotate +90°">
              ↻
            </button>
          </span>
        </label>
        <label className="me-field">
          Draw order
          <input
            className="me-name me-wide"
            type="number"
            min={0}
            step={1}
            value={object.order ?? 0}
            onChange={(event) => onChange({ order: Math.max(0, Math.floor(Number(event.target.value) || 0)) })}
          />
        </label>
        <div className="me-actions">
          <button type="button" className={`me-button${moving ? ' is-selected' : ''}`} onClick={onMove}>
            {moving ? 'Click board to place…' : 'Move'}
          </button>
          <button type="button" className="me-button me-danger" onClick={onDelete}>
            Delete
          </button>
        </div>
      </PropertySection>
      {def && (
        <TemplatePieceDetails
          piece={def}
          onStatus={onStatus}
          ambient={ambient}
          ambientColour={ambientColour}
          onAmbient={onAmbient}
          onAmbientColour={onAmbientColour}
        />
      )}
    </div>
  )
}
