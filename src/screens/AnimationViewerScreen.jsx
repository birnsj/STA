import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import EditorMenuBar from '../components/maps/EditorMenuBar.jsx'
import EditorTips from '../components/maps/EditorTips.jsx'
import EditorViewScale from '../components/maps/EditorViewScale.jsx'
import { downloadJson } from '../export/downloadJson.js'
import { resolveSpike3dAppearance } from '../spike3d/appearance.js'
import {
  animationSetIdForSpecies,
  animationViewerGroups,
  clipPlayMode,
  clipSeconds,
  defaultAnimationSetId,
  listAnimationSets,
} from '../spike3d/clips.js'
import AnimationPreview from '../spike3d/AnimationPreview.jsx'
import {
  DEFAULT_RAGDOLL_SETTINGS,
  RAGDOLL_FLAG_HELPS,
  RAGDOLL_SETTING_FIELDS,
  cloneRagdollSettings,
  parseRagdollSettingsFile,
  serializeRagdollSettings,
} from '../spike3d/ragdollSettings.js'
import { UNIFORM_DIVISION_IDS, parseHex } from '../spike3d/uniformTextures.js'
import uniformsData from '../data/adaptation/uniforms.json'
import appearanceData from '../data/adaptation/spike3dAppearance.json'
import '../components/maps/mapEditor.css'
import './animationViewer.css'

const RAGDOLL_GROUPS = [...new Set(RAGDOLL_SETTING_FIELDS.map((f) => f.group))]

const SPECIES = [...new Set(['human', ...Object.keys(appearanceData.raceMeshes ?? {})])]
const HAIR_STYLES = ['short', 'crew', 'bowl', 'bob', 'long', 'tos', 'updo', 'warrior']

const DIVISION_COLOURS = Object.fromEntries((uniformsData.divisions ?? []).map((d) => [d.id, parseHex(d.colour)]))

/** Asset tabs — same chrome as Dev Edit Assets, grouped for animation clips. */
const CLIP_TABS = [
  { id: 'move', label: 'Move', groupIds: ['walk', 'run', 'idle', 'sneak'] },
  { id: 'action', label: 'Action', groupIds: ['combat', 'reaction', 'surrender', 'panic'] },
  { id: 'fall', label: 'Fall', groupIds: ['fall', 'getup'] },
  { id: 'extra', label: 'Extra', groupIds: ['fidgets', 'base', '3dOnly'] },
]

const ANIMATION_MENUS = [
  {
    id: 'file',
    label: 'File',
    items: [
      { id: 'saveRagdoll', label: 'Save Ragdoll Settings…' },
      { id: 'loadRagdoll', label: 'Load Ragdoll Settings…' },
      { id: 'defaultsRagdoll', label: 'Reset Ragdoll Defaults' },
      { sep: true },
      { id: 'back', label: 'Back to Menu' },
    ],
  },
  {
    id: 'view',
    label: 'View',
    items: [
      { id: 'lockedIso', label: 'Locked iso' },
      { id: 'loopOnce', label: 'Loop once-clips' },
      { id: 'showSkeleton', label: 'Show skeleton' },
      { sep: true },
      { id: 'viewScale', label: 'View scale…' },
    ],
  },
  {
    id: 'playback',
    label: 'Playback',
    items: [
      { id: 'playPause', label: 'Play / Pause' },
      { id: 'restart', label: 'Restart' },
      { sep: true },
      { id: 'ragdoll', label: 'Ragdoll / Reset pose' },
    ],
  },
]

function defaultHairFor(species, gender) {
  return appearanceData.defaultHair?.[`${species}-${gender}`] ?? appearanceData.defaultHair?.[gender] ?? 'short'
}

function matchesQuery(text, q) {
  if (!q) return true
  return String(text ?? '')
    .toLowerCase()
    .includes(q)
}

function ClipGroup({ group, open, onToggle, selected, onSelect }) {
  const isOpen = open.has(group.id)
  return (
    <div className="av-group me-group">
      <button type="button" className="me-group-tag" aria-expanded={isOpen} onClick={() => onToggle(group.id)}>
        <span className="me-group-arrow" aria-hidden="true">
          {isOpen ? '▾' : '▸'}
        </span>
        <span className="me-group-label">{group.label}</span>
        <span className="me-group-count">{group.clips.length}</span>
      </button>
      {isOpen && (
        <ul className="av-group-list">
          {group.clips.map((clip) => (
            <li key={clip.name}>
              <button
                type="button"
                className={`av-list-item${clip.name === selected ? ' is-selected' : ''}`}
                onClick={() => onSelect(clip.name)}
              >
                <span className="av-list-name">{clip.name}</span>
                <span className="av-list-meta">
                  {clip.seconds}s · {clip.play}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function AnimationViewerScreen({ onBack, viewScale = 100, onViewScale }) {
  const animationSets = useMemo(() => listAnimationSets(), [])
  const [animSetId, setAnimSetId] = useState(() => defaultAnimationSetId())
  const groups = useMemo(() => animationViewerGroups(animSetId), [animSetId])
  const allClips = useMemo(() => groups.flatMap((g) => g.clips.map((c) => c.name)), [groups])
  const [selected, setSelected] = useState('idle')
  const [open, setOpen] = useState(() => new Set())
  const [clipTab, setClipTab] = useState('move')
  const [query, setQuery] = useState('')
  const [showViewScale, setShowViewScale] = useState(false)
  const [playing, setPlaying] = useState(true)
  const [progress, setProgress] = useState(0)
  const [species, setSpecies] = useState('human')
  const [gender, setGender] = useState('male')
  const [division, setDivision] = useState('command')
  const [hairStyle, setHairStyle] = useState(() => defaultHairFor('human', 'male'))
  const [lockedIso, setLockedIso] = useState(false)
  const [loopOnce, setLoopOnce] = useState(false)
  const [showSkeleton, setShowSkeleton] = useState(false)
  const [ragdollActive, setRagdollActive] = useState(false)
  const [ragdollBusy, setRagdollBusy] = useState(false)
  const [ragdollSettings, setRagdollSettings] = useState(() => cloneRagdollSettings())
  const [ragdollLoadError, setRagdollLoadError] = useState('')
  const [ragdollSectionsOpen, setRagdollSectionsOpen] = useState(() => new Set([...RAGDOLL_GROUPS, 'Settle flags']))
  const previewControllerRef = useRef(null)
  const ragdollFileRef = useRef(null)
  const shellRef = useRef(null)

  useEffect(() => {
    setHairStyle(defaultHairFor(species, gender))
  }, [species, gender])

  // Species picks appearance; humanoids share one anim set, monsters use another.
  useEffect(() => {
    setAnimSetId(animationSetIdForSpecies(species))
  }, [species])

  useEffect(() => {
    setOpen(new Set(groups.map((g) => g.id)))
    if (!allClips.length) {
      setSelected('')
      setPlaying(false)
      setProgress(0)
      return
    }
    setSelected((current) => (allClips.includes(current) ? current : allClips.find((n) => n === 'idle') ?? allClips[0]))
    setProgress(0)
    setPlaying(true)
  }, [animSetId, groups, allClips])

  const appearance = useMemo(() => {
    const base = resolveSpike3dAppearance({
      speciesId: species,
      genderId: gender,
      portraitId: `${species}-${gender}-1`,
      uniform: DIVISION_COLOURS[division] ?? DIVISION_COLOURS.command,
      enemy: species === 'klingon',
    })
    return { ...base, hairStyle }
  }, [species, gender, division, hairStyle])

  const tabDef = CLIP_TABS.find((t) => t.id === clipTab) ?? CLIP_TABS[0]
  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase()
    return groups
      .filter((group) => tabDef.groupIds.includes(group.id))
      .map((group) => ({
        ...group,
        clips: group.clips.filter((clip) => matchesQuery(clip.name, q) || matchesQuery(clip.play, q)),
      }))
      .filter((group) => group.clips.length > 0)
  }, [groups, tabDef, query])

  const anyGroupOpen = filteredGroups.some((group) => open.has(group.id))
  const showCollapse = anyGroupOpen || Boolean(query.trim())

  const seconds = clipSeconds(selected)
  const playMode = clipPlayMode(selected)
  const timeLabel = `${(progress * seconds).toFixed(2)}s / ${seconds.toFixed(2)}s`

  const toggleGroup = (id) => {
    setOpen((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const collapseAllGroups = () => {
    setOpen(new Set())
    setQuery('')
  }

  const expandAllGroups = () => {
    setOpen(new Set(filteredGroups.map((g) => g.id)))
  }

  const selectClip = (name) => {
    setSelected(name)
    setProgress(0)
    setPlaying(true)
  }

  const onProgress = useCallback((u) => {
    setProgress(u)
  }, [])

  const onScrub = (event) => {
    const u = Number(event.target.value)
    setPlaying(false)
    setProgress(u)
  }

  const restart = () => {
    if (ragdollActive) previewControllerRef.current?.resetRagdoll()
    setProgress(0)
    setPlaying(true)
  }

  const onRagdollActive = useCallback((on) => {
    setRagdollActive(Boolean(on))
    setRagdollBusy(false)
  }, [])

  const toggleRagdoll = async () => {
    const api = previewControllerRef.current
    if (!api) return
    if (ragdollActive) {
      api.resetRagdoll()
      setPlaying(true)
      return
    }
    setRagdollBusy(true)
    setPlaying(false)
    try {
      if (ragdollSettings.randomDirection) {
        const next = {
          ...ragdollSettings,
          directionDeg: Math.floor(Math.random() * 360),
        }
        setRagdollSettings(next)
        api.setRagdollSettings?.(next)
      }
      await api.triggerRagdoll()
    } finally {
      setRagdollBusy(false)
    }
  }

  const setRagdollField = (key, value) => {
    setRagdollSettings((current) => ({ ...current, [key]: value }))
  }

  const resetRagdollSettings = () => {
    setRagdollLoadError('')
    setRagdollSettings(cloneRagdollSettings(DEFAULT_RAGDOLL_SETTINGS))
  }

  const saveRagdollSettings = () => {
    setRagdollLoadError('')
    downloadJson(serializeRagdollSettings(ragdollSettings), 'ragdoll-settings.json')
  }

  const loadRagdollSettingsFile = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const text = await file.text()
      const parsed = parseRagdollSettingsFile(JSON.parse(text))
      if (parsed.error) {
        setRagdollLoadError(parsed.error)
        return
      }
      setRagdollLoadError('')
      setRagdollSettings(parsed.settings)
    } catch {
      setRagdollLoadError('Could not read that JSON file.')
    }
  }

  const toggleRagdollSection = (id) => {
    setRagdollSectionsOpen((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const onMenuAction = (id) => {
    if (id === 'back') onBack?.()
    else if (id === 'saveRagdoll') saveRagdollSettings()
    else if (id === 'loadRagdoll') ragdollFileRef.current?.click()
    else if (id === 'defaultsRagdoll') resetRagdollSettings()
    else if (id === 'lockedIso') setLockedIso((v) => !v)
    else if (id === 'loopOnce') setLoopOnce((v) => !v)
    else if (id === 'showSkeleton') setShowSkeleton((v) => !v)
    else if (id === 'viewScale') setShowViewScale(true)
    else if (id === 'playPause') {
      if (!ragdollActive) setPlaying((p) => !p)
    } else if (id === 'restart') restart()
    else if (id === 'ragdoll') toggleRagdoll()
  }

  const formatSetting = (key, value) => {
    if (typeof value !== 'number') return String(value)
    if (key === 'directionDeg') return `${Math.round(value)}°`
    if (key === 'settleMaxAge' || key === 'floorFreezeDelay') return value.toFixed(2)
    if (Number.isInteger(value)) return String(value)
    return Math.abs(value) >= 10 ? value.toFixed(1) : value.toFixed(2)
  }

  return (
    <div ref={shellRef} className="me-screen ed-shell av-screen">
      <EditorTips rootRef={shellRef} />
      <EditorMenuBar
        menus={ANIMATION_MENUS}
        onAction={onMenuAction}
        checks={{
          lockedIso,
          loopOnce,
          showSkeleton,
        }}
      />

      <div className="me-toolbar ed-toolbar av-view-bar">
        <div className="me-toolbar-row">
          <span className="me-text av-view-bar-label">View</span>
          <div className="ed-toolbar-end">
            <label className="me-check" title="Lock the camera to the isometric board angle">
              <input type="checkbox" checked={lockedIso} onChange={(e) => setLockedIso(e.target.checked)} />
              Locked iso
            </label>
            <label
              className="me-check"
              title="Replay once-clips instead of holding the last frame"
            >
              <input
                type="checkbox"
                checked={loopOnce}
                disabled={playMode === 'loop'}
                onChange={(e) => setLoopOnce(e.target.checked)}
              />
              Loop once
            </label>
            <label className="me-check" title="Draw procedural joint hierarchy">
              <input type="checkbox" checked={showSkeleton} onChange={(e) => setShowSkeleton(e.target.checked)} />
              Show skeleton
            </label>
          </div>
        </div>
      </div>

      <div className="ed-workspace">
        <aside className="ed-assets me-palette">
          <div className="ed-panel-head">
            <span>Assets</span>
            <select
              className="me-select av-anim-set-select"
              value={animSetId}
              aria-label="Animation set"
              title="Body-type catalogue: humanoids share one set; monsters use another"
              onChange={(event) => setAnimSetId(event.target.value)}
            >
              {animationSets.map((set) => (
                <option key={set.id} value={set.id}>
                  {set.label}
                </option>
              ))}
            </select>
          </div>
          <div className="ed-asset-tabs" role="tablist" aria-label="Clip set">
            {CLIP_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                className={`ed-tab${clipTab === tab.id ? ' is-active' : ''}`}
                aria-selected={clipTab === tab.id}
                onClick={() => setClipTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="ed-asset-tools">
            <input
              className="ed-asset-search me-name"
              type="search"
              value={query}
              placeholder="Search clips…"
              aria-label="Search clips"
              onChange={(event) => setQuery(event.target.value)}
            />
            <button
              type="button"
              className="me-button ed-collapse-all"
              disabled={!filteredGroups.length}
              title={showCollapse ? 'Collapse all groups' : 'Expand all groups'}
              onClick={() => (showCollapse ? collapseAllGroups() : expandAllGroups())}
            >
              {showCollapse ? 'Collapse' : 'Expand'}
            </button>
          </div>
          <div className="ed-asset-body">
            {filteredGroups.map((group) => (
              <ClipGroup
                key={group.id}
                group={group}
                open={open}
                onToggle={toggleGroup}
                selected={selected}
                onSelect={selectClip}
              />
            ))}
            {!groups.length ? (
              <p className="me-text">No clips in the {animationSets.find((s) => s.id === animSetId)?.label ?? animSetId} set yet.</p>
            ) : !filteredGroups.length ? (
              <p className="me-text">No clips match.</p>
            ) : null}
          </div>
        </aside>

        <div className="av-center">
          <div className="ed-viewport me-board-area av-viewport">
            <div className="ed-viewport-title">
              Animation preview · left-drag turn/tilt · middle-drag pan · scroll zoom
            </div>
            <div className="av-preview-wrap">
              <AnimationPreview
                clip={selected}
                playing={playing}
                progress={progress}
                appearance={appearance}
                lockedIso={lockedIso}
                loopOnce={loopOnce}
                showSkeleton={showSkeleton}
                ragdollSettings={ragdollSettings}
                onProgress={playing ? onProgress : null}
                onRagdollActive={onRagdollActive}
                controllerRef={previewControllerRef}
              />
            </div>
            <EditorViewScale
              show={showViewScale}
              onClose={() => setShowViewScale(false)}
              viewScale={viewScale}
              onViewScale={(percent) => {
                onViewScale?.(percent)
                setShowViewScale(false)
              }}
            />
          </div>

          <div className="ed-dock av-dock" aria-label="Animation controls">
            <div className="av-dock-row">
              <div className="av-dock-slot av-dock-clip">
                <p className="ed-dock-title">Clip</p>
                <strong className="av-dock-clip-name">{selected || '—'}</strong>
                <span className="me-text">
                  {selected ? `${timeLabel} · ${playMode}` : 'No clip in this set'}
                  {ragdollActive ? ' · ragdoll' : ''}
                </span>
              </div>
              <div className="av-dock-slot av-dock-transport">
                <p className="ed-dock-title">Playback</p>
                <div className="ed-seg" role="group" aria-label="Playback">
                  <button
                    type="button"
                    className={`me-button${playing && !ragdollActive ? ' is-on' : ''}`}
                    onClick={() => setPlaying((p) => !p)}
                    disabled={ragdollActive || !selected}
                  >
                    {playing ? 'Pause' : 'Play'}
                  </button>
                  <button type="button" className="me-button" onClick={restart} disabled={ragdollBusy || !selected}>
                    Restart
                  </button>
                  <button
                    type="button"
                    className={`me-button${ragdollActive ? ' is-on' : ''}`}
                    onClick={toggleRagdoll}
                    disabled={ragdollBusy || !selected}
                    title={ragdollActive ? 'Restore idle pose' : 'Collapse into Rapier ragdoll'}
                  >
                    {ragdollBusy ? 'Ragdoll…' : ragdollActive ? 'Reset' : 'Ragdoll'}
                  </button>
                </div>
              </div>
              <div className="av-dock-slot av-dock-model">
                <p className="ed-dock-title">Model</p>
                <div className="av-dock-model-fields">
                  <select className="me-select" value={species} aria-label="Species" onChange={(e) => setSpecies(e.target.value)}>
                    {SPECIES.map((id) => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))}
                  </select>
                  <select className="me-select" value={gender} aria-label="Gender" onChange={(e) => setGender(e.target.value)}>
                    <option value="male">male</option>
                    <option value="female">female</option>
                  </select>
                  <select className="me-select" value={hairStyle} aria-label="Hair" onChange={(e) => setHairStyle(e.target.value)}>
                    {HAIR_STYLES.map((id) => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))}
                  </select>
                  <select
                    className="me-select"
                    value={division}
                    aria-label="Uniform"
                    disabled={species === 'klingon'}
                    onChange={(e) => setDivision(e.target.value)}
                  >
                    {UNIFORM_DIVISION_IDS.map((id) => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="av-dock-slot av-dock-scrub">
                <p className="ed-dock-title">Scrub</p>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.001}
                  value={progress}
                  onChange={onScrub}
                  disabled={ragdollActive}
                  aria-label="Scrub"
                />
              </div>
              <div className="av-dock-slot av-dock-action">
                <p className="ed-dock-title">Ragdoll</p>
                <button type="button" className="me-button is-primary" onClick={toggleRagdoll} disabled={ragdollBusy}>
                  {ragdollBusy ? 'Ragdoll…' : ragdollActive ? 'Reset pose' : 'Apply & flop'}
                </button>
              </div>
            </div>
          </div>
        </div>

        <aside className="ed-properties me-side">
          <div className="ed-panel-head">Properties</div>
          <div className="ed-prop-sections-bar">
            <button
              type="button"
              className="ed-prop-sections-btn"
              onClick={() => setRagdollSectionsOpen(new Set([...RAGDOLL_GROUPS, 'Settle flags']))}
            >
              Expand all
            </button>
            <span className="ed-prop-sections-sep">/</span>
            <button type="button" className="ed-prop-sections-btn" onClick={() => setRagdollSectionsOpen(new Set())}>
              Collapse all
            </button>
          </div>
          <input
            ref={ragdollFileRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={loadRagdollSettingsFile}
          />
          <div className="ed-properties-body">
            <div className="av-ragdoll-actions">
              <button type="button" className="me-button" onClick={saveRagdollSettings}>
                Save
              </button>
              <button type="button" className="me-button" onClick={() => ragdollFileRef.current?.click()}>
                Load
              </button>
              <button type="button" className="me-button" onClick={resetRagdollSettings}>
                Defaults
              </button>
            </div>
            <p className="me-text av-ragdoll-note">
              Tweaks apply on the next Ragdoll. Gravity updates live if physics is already up.
            </p>
            {ragdollLoadError ? <p className="me-text av-ragdoll-error">{ragdollLoadError}</p> : null}
            <div className="av-ragdoll-actions">
              <button
                type="button"
                className="me-button is-primary"
                onClick={toggleRagdoll}
                disabled={ragdollBusy}
              >
                {ragdollBusy ? 'Ragdoll…' : ragdollActive ? 'Reset pose' : 'Apply & flop'}
              </button>
            </div>
            {RAGDOLL_GROUPS.map((group) => {
              const isOpen = ragdollSectionsOpen.has(group)
              return (
                <div key={group} className={`ed-prop-section${isOpen ? ' is-open' : ''}`}>
                  <button type="button" className="ed-prop-section-head" onClick={() => toggleRagdollSection(group)}>
                    <span className="ed-prop-section-chevron" aria-hidden="true" />
                    <span className="ed-prop-section-title">{group}</span>
                  </button>
                  {isOpen && (
                    <div className="ed-prop-section-body">
                      {RAGDOLL_SETTING_FIELDS.filter((f) => f.group === group).map((field) => (
                        <div key={field.key} className="av-ragdoll-field" title={field.help}>
                          <div className="av-ragdoll-field-label">
                            <span>{field.label}</span>
                            {field.key === 'directionDeg' ? (
                              <label
                                className="me-check av-ragdoll-inline-check"
                                title={RAGDOLL_FLAG_HELPS.randomDirection}
                              >
                                <input
                                  type="checkbox"
                                  checked={ragdollSettings.randomDirection}
                                  onChange={(e) => setRagdollField('randomDirection', e.target.checked)}
                                />
                                Random
                              </label>
                            ) : null}
                            <span className="av-ragdoll-field-value">
                              {formatSetting(field.key, ragdollSettings[field.key])}
                            </span>
                          </div>
                          <input
                            type="range"
                            min={field.min}
                            max={field.max}
                            step={field.step}
                            value={ragdollSettings[field.key]}
                            disabled={field.key === 'directionDeg' && ragdollSettings.randomDirection}
                            onChange={(e) => setRagdollField(field.key, Number(e.target.value))}
                            aria-label={field.label}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
            <div className={`ed-prop-section${ragdollSectionsOpen.has('Settle flags') ? ' is-open' : ''}`}>
              <button
                type="button"
                className="ed-prop-section-head"
                onClick={() => toggleRagdollSection('Settle flags')}
              >
                <span className="ed-prop-section-chevron" aria-hidden="true" />
                <span className="ed-prop-section-title">Settle flags</span>
              </button>
              {ragdollSectionsOpen.has('Settle flags') && (
                <div className="ed-prop-section-body">
                  <label className="me-check" title={RAGDOLL_FLAG_HELPS.freezeOnFloor}>
                    <input
                      type="checkbox"
                      checked={ragdollSettings.freezeOnFloor}
                      onChange={(e) => setRagdollField('freezeOnFloor', e.target.checked)}
                    />
                    Freeze on floor hit
                  </label>
                  <label className="me-check" title={RAGDOLL_FLAG_HELPS.dampRamp}>
                    <input
                      type="checkbox"
                      checked={ragdollSettings.dampRamp}
                      onChange={(e) => setRagdollField('dampRamp', e.target.checked)}
                    />
                    Damping ramp
                  </label>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
