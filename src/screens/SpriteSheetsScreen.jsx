import { useEffect, useMemo, useRef, useState } from 'react'
import EditorSubScreen from '../components/maps/EditorSubScreen.jsx'
import SpriteSheetPreview from '../components/maps/SpriteSheetPreview.jsx'
import {
  bumpSpriteCache,
  canEditSprites,
  downloadSprite,
  importSprite,
  listSpriteFiles,
  spriteCacheVersion,
} from '../maps/spriteFiles.js'
import {
  categorizeSpriteEntries,
  enrichSpriteEntry,
  expectedSpriteSize,
  filterSpriteEntries,
  listPreviewAnimations,
  SPRITE_TYPE_ORDER,
  spriteGroupLabel,
} from '../rules/spriteCatalogue.js'
import '../components/maps/spriteSheets.css'

function SpriteCategoryTabs({ categories, activeId, onSelect }) {
  return (
    <div className="ss-type-tabs ed-asset-tabs" role="tablist" aria-label="Sprite type">
      {categories.map((category) => (
        <button
          key={category.id}
          type="button"
          role="tab"
          className={`ed-tab${category.id === activeId ? ' is-active' : ''}`}
          aria-selected={category.id === activeId}
          onClick={() => onSelect(category.id)}
        >
          {category.label}
          <span className="ss-type-count">{category.count}</span>
        </button>
      ))}
    </div>
  )
}

function SpriteSubgroup({ subgroup, open, onToggle, selectedPath, onSelect }) {
  const isOpen = open.has(subgroup.id)
  return (
    <div className="ss-group me-group">
      <button type="button" className="me-group-tag" aria-expanded={isOpen} onClick={() => onToggle(subgroup.id)}>
        <span className="me-group-arrow" aria-hidden="true">
          {isOpen ? '▾' : '▸'}
        </span>
        <span className="me-group-label">{subgroup.label}</span>
        <span className="me-group-count">{subgroup.entries.length}</span>
      </button>
      {isOpen && (
        <ul className="ss-group-list">
          {subgroup.entries.map((entry) => (
            <li key={entry.path}>
              <button
                type="button"
                className={`ss-list-item${entry.path === selectedPath ? ' is-selected' : ''}`}
                onClick={() => onSelect(entry.path)}
                title={entry.path}
              >
                <span className="ss-list-name">{entry.name}</span>
                <span className="ss-list-path">{entry.path.replace('/art/sprites/', '')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function SpriteSheetsScreen({ onBack }) {
  const [entries, setEntries] = useState([])
  const [selectedPath, setSelectedPath] = useState(null)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [version, setVersion] = useState(spriteCacheVersion)
  const [animation, setAnimation] = useState(null)
  const [facing, setFacing] = useState('s')
  const [loopPreview, setLoopPreview] = useState(true)
  const [busy, setBusy] = useState(false)
  const [typeId, setTypeId] = useState('characters')
  const [openSubgroups, setOpenSubgroups] = useState(() => new Set())
  const fileRef = useRef(null)

  const loadList = async () => {
    try {
      const list = await listSpriteFiles()
      const enriched = list.map(enrichSpriteEntry)
      setEntries(enriched)
      setSelectedPath((current) => current ?? enriched[0]?.path ?? null)
      if (!enriched.length) setStatus('No PNGs found under public/art/sprites/.')
    } catch (error) {
      setStatus(error.message || String(error))
      setEntries([])
    }
  }

  useEffect(() => {
    loadList()
  }, [])

  const filtered = useMemo(() => filterSpriteEntries(entries, query), [entries, query])
  const categories = useMemo(() => categorizeSpriteEntries(filtered), [filtered])

  // Keep a fixed tab order even when a type has no matches under the filter.
  const typeTabs = useMemo(() => {
    const byId = new Map(categories.map((category) => [category.id, category]))
    const known = SPRITE_TYPE_ORDER.map((id) => byId.get(id) ?? { id, label: spriteGroupLabel(id), count: 0, subgroups: [] })
    const extras = categories.filter((category) => !SPRITE_TYPE_ORDER.includes(category.id))
    return [...known, ...extras].filter((category) => category.count > 0 || !query.trim())
  }, [categories, query])

  useEffect(() => {
    if (!typeTabs.length) return
    if (!typeTabs.some((tab) => tab.id === typeId)) setTypeId(typeTabs[0].id)
  }, [typeTabs, typeId])

  const activeCategory = typeTabs.find((tab) => tab.id === typeId) ?? typeTabs[0] ?? null
  const subgroups = activeCategory?.subgroups ?? []

  const activeTypeId = activeCategory?.id
  const subgroupIdsKey = subgroups.map((subgroup) => subgroup.id).join('|')

  useEffect(() => {
    if (!subgroupIdsKey) {
      setOpenSubgroups(new Set())
      return
    }
    const ids = subgroupIdsKey.split('|')
    // Open every subgroup while filtering; otherwise the first folder in this type.
    if (query.trim()) {
      setOpenSubgroups(new Set(ids))
      return
    }
    setOpenSubgroups(new Set([ids[0]]))
  }, [activeTypeId, subgroupIdsKey, query])

  // Switching Characters → FX (etc.) should preview a file from that tab, not the previous selection.
  useEffect(() => {
    if (!activeCategory?.entries?.length) return
    const inTab = activeCategory.entries.some((entry) => entry.path === selectedPath)
    if (!inTab) setSelectedPath(activeCategory.entries[0].path)
  }, [activeTypeId, activeCategory, selectedPath])

  const selected = useMemo(() => entries.find((entry) => entry.path === selectedPath) ?? null, [entries, selectedPath])

  useEffect(() => {
    if (!selected) {
      setAnimation(null)
      return
    }
    const names = listPreviewAnimations(selected.path, selected.character)
    setAnimation((current) => (names.includes(current) ? current : names[0] ?? null))
  }, [selected])

  const toggleSubgroup = (id) =>
    setOpenSubgroups((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const anySubgroupOpen = subgroups.some((subgroup) => openSubgroups.has(subgroup.id))
  const collapseAllSubgroups = () => setOpenSubgroups(new Set())
  const expandAllSubgroups = () => setOpenSubgroups(new Set(subgroups.map((subgroup) => subgroup.id)))

  const onExport = async () => {
    if (!selected) return
    try {
      setBusy(true)
      await downloadSprite(selected.path)
      setStatus(`Exported ${selected.name} (transparent PNG).`)
    } catch (error) {
      setStatus(error.message || String(error))
    } finally {
      setBusy(false)
    }
  }

  const onPickImport = () => fileRef.current?.click()

  const onImportFile = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !selected) return
    if (!canEditSprites) {
      setStatus('Import needs the Vite DEV server.')
      return
    }
    const expected = expectedSpriteSize(selected.path)
    if (expected) {
      const ok = window.confirm(
        `Replace ${selected.path}?\n\nCharacter sheets should stay ${expected.width}×${expected.height}px (frame grid). Continue?`,
      )
      if (!ok) return
    } else if (!window.confirm(`Replace ${selected.path}?`)) {
      return
    }
    try {
      setBusy(true)
      const result = await importSprite(selected.path, file)
      setVersion(result.version ?? bumpSpriteCache())
      setStatus(`Imported ${selected.name}.`)
      await loadList()
    } catch (error) {
      setStatus(error.message || String(error))
    } finally {
      setBusy(false)
    }
  }

  const animNames = selected ? listPreviewAnimations(selected.path, selected.character) : []
  const animPreviewBlocked = Boolean(selected?.character?.isMask || (selected?.path || '').includes('-uniform.png'))

  return (
    <EditorSubScreen
      className="ss-screen"
      title="Sprite Sheets"
      toolbar={
        <>
          <button type="button" className="me-button" disabled={!selected || busy} onClick={onExport}>
            Export
          </button>
          <button type="button" className="me-button is-primary" disabled={!selected || !canEditSprites || busy} onClick={onPickImport}>
            Import…
          </button>
          <input ref={fileRef} type="file" accept="image/png,.png" hidden onChange={onImportFile} />
          <button type="button" className="me-button" onClick={onBack}>
            Back to Menu
          </button>
          {!canEditSprites && <span className="me-text">Import needs the Vite DEV server (view/export still work if listed).</span>}
          {status && <span className="me-text ss-status">{status}</span>}
        </>
      }
    >
      <div className="ss-body">
        <aside className="ss-list-pane">
          <SpriteCategoryTabs categories={typeTabs} activeId={activeCategory?.id} onSelect={setTypeId} />
          <div className="ss-list-tools">
            <input
              className="me-name me-wide"
              placeholder="Filter by path or name"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button
              type="button"
              className="me-button ss-collapse-all"
              disabled={!subgroups.length}
              title={anySubgroupOpen ? 'Collapse all groups' : 'Expand all groups'}
              onClick={() => (anySubgroupOpen ? collapseAllSubgroups() : expandAllSubgroups())}
            >
              {anySubgroupOpen ? 'Collapse' : 'Expand'}
            </button>
          </div>
          <div className="ss-list">
            {subgroups.map((subgroup) => (
              <SpriteSubgroup
                key={subgroup.id}
                subgroup={subgroup}
                open={openSubgroups}
                onToggle={toggleSubgroup}
                selectedPath={selectedPath}
                onSelect={setSelectedPath}
              />
            ))}
            {!subgroups.length && <p className="me-text">No sprites match.</p>}
          </div>
        </aside>

        <section className="ss-detail">
          {selected ? (
            <>
              <div className="ss-detail-head">
                <div>
                  <p className="ss-detail-name">{selected.name}</p>
                  <p className="me-text">{selected.path}</p>
                  {selected.character && (
                    <p className="me-text">
                      Set {selected.character.setId} · sheet {selected.character.sheetId}
                      {selected.character.isMask ? ' · uniform mask' : ''}
                    </p>
                  )}
                </div>
              </div>
              <SpriteSheetPreview
                path={selected.path}
                version={version}
                character={selected.character}
                animation={animation}
                animNames={animPreviewBlocked ? [] : animNames}
                onAnimationChange={setAnimation}
                facing={facing}
                onFacingChange={setFacing}
                loop={loopPreview}
                onLoopChange={setLoopPreview}
              />
            </>
          ) : (
            <p className="me-text">Select a sprite sheet.</p>
          )}
        </section>
      </div>
    </EditorSubScreen>
  )
}
