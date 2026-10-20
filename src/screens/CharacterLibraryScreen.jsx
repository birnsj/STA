import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import {
  getAuthoredCatalogueVersion,
  getAuthoredRecord,
  listAuthoredCharacterEntries,
  listAuthoredCharacters,
  subscribeAuthoredCatalogue,
} from '../character/authoredCharacters.js'
import { withCreatorShape } from '../character/characterImport.js'
import { createEmptyCharacter } from '../character/characterModel.js'
import {
  canSaveAuthoredCharacters,
  deleteAuthoredCharacterEntry,
  saveAuthoredCharacterEntry,
} from '../character/authoredCharacterFiles.js'
import { AuthoredCharacterProvider } from '../character/AuthoredCharacterSession.jsx'
import {
  authoredSaveIssues,
  buildAuthoredPoolEntry,
  canSaveAuthoredEdit,
  canSaveNewAuthoredCharacter,
  duplicateAuthoredEntry,
  newAuthoredCharacterId,
} from '../character/authoredPool.js'
import {
  findAuthoredCharacterReferencesAsync,
  formatAuthoredReference,
} from '../character/authoredReferences.js'
import ConfirmDialog from '../components/maps/ConfirmDialog.jsx'
import '../components/maps/mapEditor.css'

const CharacterCreator = lazy(() => import('../CharacterCreator.jsx'))

function portraitUrl(record) {
  return record?.character?.identity?.portrait?.image || null
}

function summaryLines(record) {
  if (!record) return []
  const final = record.final || {}
  const attrs = final.attributes
  const discs = final.disciplines
  const lines = []
  if (record.character?.species?.name) lines.push(`Species: ${record.character.species.name}`)
  if (record.character?.faction?.name) lines.push(`Faction: ${record.character.faction.name}`)
  if (final.rank?.name) lines.push(`Rank: ${final.rank.name}`)
  if (final.department?.name) lines.push(`Department: ${final.department.name}`)
  if (final.role?.name) lines.push(`Role: ${final.role.name}`)
  if (attrs) {
    lines.push(
      `Attrs: C${attrs.control} D${attrs.daring} F${attrs.fitness} I${attrs.insight} P${attrs.presence} R${attrs.reason}`,
    )
  }
  if (discs) {
    lines.push(
      `Depts: Cmd${discs.command} Conn${discs.conn} Sec${discs.security} Eng${discs.engineering} Sci${discs.science} Med${discs.medicine}`,
    )
  }
  const gear = (final.equipment || []).map((item) => item.name || item.itemId).filter(Boolean)
  if (gear.length) lines.push(`Equipment: ${gear.join(', ')}`)
  return lines
}

function filterEntry(entry, record, { query, faction, species, rank, department }) {
  const name = (entry.name || '').toLowerCase()
  const id = (entry.id || '').toLowerCase()
  const q = query.trim().toLowerCase()
  if (q && !name.includes(q) && !id.includes(q)) return false
  if (faction && (record?.character?.faction?.id || entry.faction) !== faction) return false
  if (species && record?.character?.species?.id !== species) return false
  if (rank && record?.final?.rank?.id !== rank) return false
  if (department && (record?.final?.department?.id || record?.character?.career?.department?.id) !== department) {
    return false
  }
  return true
}

/**
 * Dev Edit Character Library: browse / CRUD the authored NPC pool (characters.json).
 * map: open map (for reference checks and Use for placement). Stays mounted under the creator overlay.
 */
export default function CharacterLibraryScreen({
  map = null,
  selectedNpcId = null,
  onBack,
  onUseForPlacement,
  onUpdateNpcCharacter,
}) {
  const [catalogueVersion, setCatalogueVersion] = useState(getAuthoredCatalogueVersion)
  const [query, setQuery] = useState('')
  const [faction, setFaction] = useState('')
  const [species, setSpecies] = useState('')
  const [rank, setRank] = useState('')
  const [department, setDepartment] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [status, setStatus] = useState(null)
  const [question, setQuestion] = useState(null)
  // null | { mode: 'create' } | { mode: 'edit', id } | { mode: 'duplicate', entry }
  const [session, setSession] = useState(null)

  useEffect(() => subscribeAuthoredCatalogue(setCatalogueVersion), [])

  const entries = useMemo(() => listAuthoredCharacters(), [catalogueVersion])
  const recordsById = useMemo(() => {
    const map = new Map()
    listAuthoredCharacterEntries().forEach((entry) => {
      map.set(entry.id, getAuthoredRecord(entry.id))
    })
    return map
  }, [catalogueVersion])

  const filterOptions = useMemo(() => {
    const factions = new Map()
    const specieses = new Map()
    const ranks = new Map()
    const departments = new Map()
    recordsById.forEach((record) => {
      const f = record?.character?.faction
      if (f?.id) factions.set(f.id, f.name || f.id)
      const s = record?.character?.species
      if (s?.id) specieses.set(s.id, s.name || s.id)
      const r = record?.final?.rank
      if (r?.id) ranks.set(r.id, r.name || r.id)
      const d = record?.final?.department || record?.character?.career?.department
      if (d?.id) departments.set(d.id, d.name || d.id)
    })
    return {
      factions: [...factions.entries()].sort((a, b) => a[1].localeCompare(b[1])),
      species: [...specieses.entries()].sort((a, b) => a[1].localeCompare(b[1])),
      ranks: [...ranks.entries()].sort((a, b) => a[1].localeCompare(b[1])),
      departments: [...departments.entries()].sort((a, b) => a[1].localeCompare(b[1])),
    }
  }, [recordsById])

  const filtered = useMemo(() => {
    const filters = { query, faction, species, rank, department }
    return entries
      .filter((entry) => filterEntry(entry, recordsById.get(entry.id), filters))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [entries, recordsById, query, faction, species, rank, department])

  useEffect(() => {
    if (selectedId && !recordsById.has(selectedId)) setSelectedId(null)
  }, [selectedId, recordsById])

  const selected = selectedId ? recordsById.get(selectedId) : null

  const askConfirm = (details) => new Promise((resolve) => setQuestion({ ...details, resolve }))
  const answer = (confirmed) => {
    question.resolve(confirmed)
    setQuestion(null)
  }

  const onCreate = () => setSession({ mode: 'create' })
  const onEdit = (id) => {
    if (!getAuthoredRecord(id)) return setStatus(`Unknown character ${id}.`)
    setSession({ mode: 'edit', id })
  }
  const onDuplicate = async (id) => {
    const record = getAuthoredRecord(id)
    if (!record) return setStatus(`Unknown character ${id}.`)
    const raw = listAuthoredCharacterEntries().find((entry) => entry.id === id)
    if (!raw) return
    const dup = duplicateAuthoredEntry(raw)
    setSession({ mode: 'duplicate', entry: dup })
  }

  const onDelete = async (id) => {
    if (!canSaveAuthoredCharacters) {
      return setStatus('Deleting authored characters needs the Vite DEV server.')
    }
    const refs = await findAuthoredCharacterReferencesAsync(id, { openMap: map })
    if (refs.length) {
      const list = refs.slice(0, 8).map(formatAuthoredReference).join('\n')
      const more = refs.length > 8 ? `\n…and ${refs.length - 8} more.` : ''
      return setStatus(`Cannot delete “${id}”: still referenced.\n${list}${more}`)
    }
    const name = getAuthoredRecord(id)?.character?.identity?.name || id
    const ok = await askConfirm({
      title: 'Delete Character',
      message: `Remove “${name}” (${id}) from the authored pool? This cannot be undone.`,
      confirmLabel: 'Delete',
    })
    if (!ok) return
    try {
      await deleteAuthoredCharacterEntry(id)
      setSelectedId((current) => (current === id ? null : current))
      setStatus(`Deleted ${id} from the character pool.`)
    } catch (error) {
      setStatus(`Could not delete: ${error.message}`)
    }
  }

  const onUse = (id) => {
    if (!id) return
    if (selectedNpcId && onUpdateNpcCharacter) {
      onUpdateNpcCharacter(selectedNpcId, id)
      setStatus(`Updated selected NPC to ${id}.`)
      onBack()
      return
    }
    if (onUseForPlacement) {
      onUseForPlacement(id)
      onBack()
    }
  }

  const closeSession = () => setSession(null)

  if (session) {
    return (
      <Suspense fallback={<div className="me-screen cl-screen">Loading creator…</div>}>
        <AuthoredCreatorOverlay session={session} map={map} onClose={closeSession} onStatus={setStatus} />
      </Suspense>
    )
  }

  return (
    <div className="me-screen cl-screen">
      <div className="me-toolbar">
        <strong className="cl-title">Character Library</strong>
        <button type="button" className="me-button is-primary" onClick={onCreate} disabled={!canSaveAuthoredCharacters}>
          Create
        </button>
        <button type="button" className="me-button" onClick={onBack}>
          Back to Map
        </button>
        {!canSaveAuthoredCharacters && (
          <span className="me-text">Pool Save/Delete needs the Vite DEV server (read-only here).</span>
        )}
      </div>
      <div className="cl-body">
        <aside className="cl-list-pane">
          <div className="cl-filters">
            <input
              className="me-name me-wide"
              placeholder="Search name or id"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <select className="me-select me-wide" value={faction} onChange={(e) => setFaction(e.target.value)}>
              <option value="">All factions</option>
              {filterOptions.factions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
            <select className="me-select me-wide" value={species} onChange={(e) => setSpecies(e.target.value)}>
              <option value="">All species</option>
              {filterOptions.species.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
            <select className="me-select me-wide" value={rank} onChange={(e) => setRank(e.target.value)}>
              <option value="">All ranks</option>
              {filterOptions.ranks.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
            <select className="me-select me-wide" value={department} onChange={(e) => setDepartment(e.target.value)}>
              <option value="">All departments</option>
              {filterOptions.departments.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <ul className="cl-list">
            {filtered.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  className={`cl-list-item${entry.id === selectedId ? ' is-selected' : ''}`}
                  onClick={() => setSelectedId(entry.id)}
                >
                  <span className="cl-list-name">{entry.name}</span>
                  <span className="cl-list-id">{entry.id}</span>
                </button>
              </li>
            ))}
            {!filtered.length && <li className="me-text">No characters match.</li>}
          </ul>
        </aside>
        <section className="cl-preview">
          {selected ? (
            <>
              <div className="cl-preview-head">
                {portraitUrl(selected) ? (
                  <img className="cl-portrait" src={portraitUrl(selected)} alt="" />
                ) : (
                  <div className="cl-portrait cl-portrait-empty" />
                )}
                <div>
                  <h2 className="cl-preview-name">{selected.character?.identity?.name || selected.id}</h2>
                  <p className="me-text">{selected.id}</p>
                  {selected.playtestParty && <p className="me-text">Playtest party</p>}
                </div>
              </div>
              <ul className="cl-summary">
                {summaryLines(selected).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <div className="cl-actions">
                <button type="button" className="me-button is-primary" onClick={() => onUse(selected.id)}>
                  Use for placement
                </button>
                <button type="button" className="me-button" onClick={() => onEdit(selected.id)}>
                  Edit
                </button>
                <button type="button" className="me-button" onClick={() => onDuplicate(selected.id)} disabled={!canSaveAuthoredCharacters}>
                  Duplicate
                </button>
                <button type="button" className="me-button" onClick={() => onDelete(selected.id)} disabled={!canSaveAuthoredCharacters}>
                  Delete
                </button>
              </div>
            </>
          ) : (
            <p className="me-text">Select a character to preview, edit, or place.</p>
          )}
          {status && (
            <pre className="cl-status" role="status">
              {status}
            </pre>
          )}
        </section>
      </div>
      {question && (
        <ConfirmDialog
          title={question.title}
          message={question.message}
          confirmLabel={question.confirmLabel}
          onConfirm={() => answer(true)}
          onCancel={() => answer(false)}
        />
      )}
    </div>
  )
}

function AuthoredCreatorOverlay({ session, onClose, onStatus }) {
  const previousEntry =
    session.mode === 'edit'
      ? listAuthoredCharacterEntries().find((entry) => entry.id === session.id)
      : session.mode === 'duplicate'
        ? session.entry
        : null

  const initialCharacter = useMemo(() => {
    if (session.mode === 'create') return null
    if (session.mode === 'duplicate') {
      return withCreatorShape(session.entry.character, createEmptyCharacter())
    }
    return getAuthoredRecord(session.id)?.character ?? null
  }, [session])

  const providerKey =
    session.mode === 'create' ? 'create' : session.mode === 'duplicate' ? `dup-${session.entry.id}` : `edit-${session.id}`

  const onSave = async (character) => {
    if (!canSaveAuthoredCharacters) {
      onStatus('Saving authored characters needs the Vite DEV server.')
      return
    }
    const isCreate = session.mode === 'create'
    const issues = authoredSaveIssues(character, {
      isNew: isCreate,
      previousFinal: previousEntry?.final,
    })
    if (issues.length) {
      onStatus(issues.join(' '))
      return
    }

    const entryId = isCreate
      ? newAuthoredCharacterId(character.identity?.name || 'character')
      : session.mode === 'duplicate'
        ? session.entry.id
        : session.id

    const entry = buildAuthoredPoolEntry({
      id: entryId,
      character,
      previousEntry:
        session.mode === 'edit'
          ? previousEntry
          : session.mode === 'duplicate'
            ? {
                final: session.entry.final,
                sourceClassification: session.entry.sourceClassification,
              }
            : null,
      playtestParty: false,
    })

    try {
      await saveAuthoredCharacterEntry(entry)
      onStatus(`Saved ${entry.id} to the character pool.`)
      onClose()
    } catch (error) {
      onStatus(`Could not save: ${error.message}`)
    }
  }

  return (
    <div className="cl-creator-overlay">
      <AuthoredCharacterProvider key={providerKey} initialCharacter={initialCharacter}>
        <CharacterCreator
          mode="authored"
          authored={{
            isNew: session.mode === 'create',
            previousFinal: previousEntry?.final,
            canSave: (character) =>
              session.mode === 'create'
                ? canSaveNewAuthoredCharacter(character)
                : canSaveAuthoredEdit(character, previousEntry?.final),
            onSave,
          }}
          onExit={onClose}
          onConfirmed={() => {}}
          showGuide={false}
        />
      </AuthoredCharacterProvider>
    </div>
  )
}
