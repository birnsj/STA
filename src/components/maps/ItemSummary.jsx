import { useEffect, useRef, useState } from 'react'
import { getCategoryName, getItemById, getItemStatLines } from '../../rules/equipment.js'
import { canEditItems, setItemDescription, setItemDescriptionLocal } from '../../rules/itemFiles.js'
import { propSpriteSize, stackSizeOf } from '../../rules/placement.js'
import { PropertySection } from './PropertySections.jsx'

function PropRows({ rows }) {
  const shown = rows.filter((row) => row[1] != null && row[1] !== '')
  if (!shown.length) return null
  return (
    <dl className="ed-prop-table">
      {shown.map(([label, value, title]) => (
        <div key={label} className="ed-prop-row">
          <dt>{label}</dt>
          <dd title={title || undefined}>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

const SLOT_LABELS = {
  body: 'Body',
  sidearm: 'Sidearm',
  scanner: 'Scanner',
  communicator: 'Communicator',
}

function slotLabel(item) {
  if (!item?.equipSlot) return 'Bag / ground'
  return SLOT_LABELS[item.equipSlot] ?? item.equipSlot
}

function ArtThumb({ src, label, file }) {
  const [pixels, setPixels] = useState(null)
  if (!src) return null
  return (
    <div className="ed-prop-row">
      <dt>{label}</dt>
      <dd className="ed-prop-thumb" title={file}>
        <img
          src={src}
          alt=""
          onLoad={(event) => {
            const { naturalWidth: width, naturalHeight: height } = event.currentTarget
            setPixels((prev) => (prev?.width === width && prev?.height === height ? prev : { width, height }))
          }}
        />
        <span>
          {file.split('/').pop()}
          {pixels ? ` · ${pixels.width}×${pixels.height} px` : ''}
        </span>
      </dd>
    </div>
  )
}

// Last description written to items.json. The live catalogue entry changes while typing, so a remount
// cannot treat that unsaved text as the saved copy.
const savedDescriptions = new Map()

function savedDescription(item) {
  if (!item) return ''
  if (!savedDescriptions.has(item.id)) savedDescriptions.set(item.id, item.description ?? '')
  return savedDescriptions.get(item.id)
}

// Catalogue description, shared by the palette asset and a placed prop. Edits the item definition, not the placement.
function ItemDescriptionField({ itemId, onStatus }) {
  const item = getItemById(itemId)
  const [draft, setDraft] = useState(item?.description ?? '')
  const draftRef = useRef(draft)
  const savedRef = useRef(savedDescription(item))
  const onStatusRef = useRef(onStatus)
  const commitRef = useRef(null)

  const commit = () => {
    if (!canEditItems) return
    const next = draftRef.current
    if (next === savedRef.current) return
    const name = getItemById(itemId)?.name ?? itemId
    setItemDescription(itemId, next)
      .then(() => {
        savedRef.current = next
        savedDescriptions.set(itemId, next)
        onStatusRef.current?.(`${name} description saved.`)
      })
      .catch((error) => {
        setItemDescriptionLocal(itemId, savedRef.current)
        draftRef.current = savedRef.current
        setDraft(savedRef.current)
        onStatusRef.current?.(`Could not save description for ${name}: ${error.message}`)
      })
  }

  const onChange = (event) => {
    const next = event.target.value
    draftRef.current = next
    setDraft(next)
    if (canEditItems) setItemDescriptionLocal(itemId, next)
  }

  useEffect(() => {
    commitRef.current = commit
    onStatusRef.current = onStatus
  })
  useEffect(() => () => commitRef.current?.(), [])
  if (!item) return null

  return (
    <>
      <label className="me-field">
        Description
        <textarea
          className="me-name me-wide me-description"
          rows={4}
          readOnly={!canEditItems}
          value={draft}
          onChange={onChange}
          onBlur={commit}
        />
      </label>
      <p className="me-text">Catalogue text for every copy of this item.</p>
    </>
  )
}

// The item block on the Red Stack Box properties window: preview, identity, pixel size, thumbnail.
// Catalogue tools and placed ground items both use it, so every item reads the same way.
export default function ItemSummary({ itemId, footer = null, onStatus = null }) {
  const item = getItemById(itemId)
  const stack = item ? stackSizeOf(item) : null
  const picture = item ? propSpriteSize(item) : null
  const preview = item?.worldImage || item?.icon
  return (
    <>
      <div className="ed-asset-preview">
        {preview ? <img className="ed-asset-preview-art" src={preview} alt="" /> : <span className="me-swatch is-area" aria-hidden="true" />}
      </div>
      <p className="ed-asset-name">{item?.name ?? itemId}</p>
      <PropRows
        rows={[
          ['Id', item?.id ?? itemId],
          ['Category', item ? getCategoryName(item.category) : null],
          ['Slot', slotLabel(item)],
          ['Size', stack ? `${stack.width}×${stack.depth}×${stack.height} px` : null, 'Width × depth × height, in tile pixels (a tile is 64×64)'],
          ['Picture', picture ? `${picture.width}×${picture.height} px` : null, 'The picture at its pixel size, in the same design pixels as a tile'],
        ]}
      />
      <ArtThumb src={item?.icon} label="Icon" file={item?.icon} />
      <ItemDescriptionField key={itemId} itemId={itemId} onStatus={onStatus} />
      {footer}
    </>
  )
}

export function ItemStatSection({ itemId }) {
  const item = getItemById(itemId)
  const stats = item ? getItemStatLines(item) : []
  if (!stats.length) return null
  return (
    <PropertySection id="item-stats" title="Stats" defaultOpen={false}>
      <PropRows rows={stats.map((line) => [line.label, String(line.value ?? '')])} />
    </PropertySection>
  )
}
