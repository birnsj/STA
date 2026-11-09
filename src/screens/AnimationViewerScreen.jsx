import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import EditorSubScreen from '../components/maps/EditorSubScreen.jsx'
import { resolveSpike3dAppearance } from '../spike3d/appearance.js'
import { animationViewerGroups, clipPlayMode, clipSeconds } from '../spike3d/clips.js'
import AnimationPreview from '../spike3d/AnimationPreview.jsx'
import {
  DEFAULT_RAGDOLL_SETTINGS,
  RAGDOLL_SETTING_FIELDS,
  cloneRagdollSettings,
} from '../spike3d/ragdollSettings.js'
import { UNIFORM_DIVISION_IDS, parseHex } from '../spike3d/uniformTextures.js'
import uniformsData from '../data/adaptation/uniforms.json'
import appearanceData from '../data/adaptation/spike3dAppearance.json'
import '../components/maps/mapEditor.css'
import '../components/maps/spriteSheets.css'
import './animationViewer.css'

const RAGDOLL_GROUPS = [...new Set(RAGDOLL_SETTING_FIELDS.map((f) => f.group))]

const SPECIES = [...new Set(['human', ...Object.keys(appearanceData.raceMeshes ?? {})])]
const HAIR_STYLES = ['short', 'crew', 'bowl', 'bob', 'long', 'tos', 'updo', 'warrior']

const DIVISION_COLOURS = Object.fromEntries((uniformsData.divisions ?? []).map((d) => [d.id, parseHex(d.colour)]))

function defaultHairFor(species, gender) {
  return appearanceData.defaultHair?.[`${species}-${gender}`] ?? appearanceData.defaultHair?.[gender] ?? 'short'
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

export default function AnimationViewerScreen({ onBack }) {
  const groups = useMemo(() => animationViewerGroups(), [])
  const allClips = useMemo(() => groups.flatMap((g) => g.clips.map((c) => c.name)), [groups])
  const [selected, setSelected] = useState(() => allClips.find((n) => n === 'idle') ?? allClips[0] ?? 'idle')
  const [open, setOpen] = useState(() => new Set(groups.map((g) => g.id)))
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
  const previewControllerRef = useRef(null)

  useEffect(() => {
    setHairStyle(defaultHairFor(species, gender))
  }, [species, gender])

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
      await api.triggerRagdoll()
    } finally {
      setRagdollBusy(false)
    }
  }

  const setRagdollField = (key, value) => {
    setRagdollSettings((current) => ({ ...current, [key]: value }))
  }

  const resetRagdollSettings = () => {
    setRagdollSettings(cloneRagdollSettings(DEFAULT_RAGDOLL_SETTINGS))
  }

  const formatSetting = (key, value) => {
    if (typeof value !== 'number') return String(value)
    if (key === 'directionDeg') return `${Math.round(value)}°`
    if (key === 'settleMaxAge' || key === 'floorFreezeDelay') return value.toFixed(2)
    if (Number.isInteger(value)) return String(value)
    return Math.abs(value) >= 10 ? value.toFixed(1) : value.toFixed(2)
  }

  return (
    <EditorSubScreen
      className="av-screen"
      title="Animations"
      toolbar={
        <>
          <button type="button" className="me-button" onClick={onBack}>
            Back to Menu
          </button>
          <span className="me-text av-hint">Left-drag turn/tilt · middle-drag pan · scroll zoom. Scrub while paused.</span>
        </>
      }
    >
      <div className="av-body">
        <aside className="av-list-pane">
          <div className="av-list-tools">
            <button
              type="button"
              className="me-button"
              onClick={() => setOpen(new Set())}
              disabled={!open.size}
            >
              Collapse
            </button>
            <button
              type="button"
              className="me-button"
              onClick={() => setOpen(new Set(groups.map((g) => g.id)))}
              disabled={open.size === groups.length}
            >
              Expand
            </button>
          </div>
          <div className="av-list">
            {groups.map((group) => (
              <ClipGroup
                key={group.id}
                group={group}
                open={open}
                onToggle={toggleGroup}
                selected={selected}
                onSelect={selectClip}
              />
            ))}
          </div>
        </aside>

        <section className="av-detail">
          <div className="av-top-bar">
            <label className="av-check">
              <input type="checkbox" checked={lockedIso} onChange={(e) => setLockedIso(e.target.checked)} />
              Locked iso
            </label>
            <label className="av-check" title="Replay once-clips instead of holding the last frame">
              <input
                type="checkbox"
                checked={loopOnce}
                onChange={(e) => setLoopOnce(e.target.checked)}
                disabled={playMode === 'loop'}
              />
              Loop once
            </label>
            <label className="av-check" title="Draw procedural joint hierarchy (hips / spine / limbs)">
              <input
                type="checkbox"
                checked={showSkeleton}
                onChange={(e) => setShowSkeleton(e.target.checked)}
              />
              Show skeleton
            </label>
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

          <div className="av-transport combat-panel">
            <div className="av-transport-meta">
              <strong className="av-clip-name">{selected}</strong>
              <span className="me-text">
                {timeLabel} · {playMode}
                {ragdollActive ? ' · ragdoll' : ''}
              </span>
            </div>
            <div className="av-transport-row">
              <button
                type="button"
                className="me-button is-primary"
                onClick={() => setPlaying((p) => !p)}
                disabled={ragdollActive}
              >
                {playing ? 'Pause' : 'Play'}
              </button>
              <button type="button" className="me-button" onClick={restart} disabled={ragdollActive}>
                Restart
              </button>
              <button
                type="button"
                className={`me-button${ragdollActive ? ' is-primary' : ''}`}
                onClick={toggleRagdoll}
                disabled={ragdollBusy}
                title={ragdollActive ? 'Restore idle pose' : 'Collapse into Rapier ragdoll'}
              >
                {ragdollBusy ? 'Ragdoll…' : ragdollActive ? 'Reset' : 'Ragdoll'}
              </button>
              <label className="av-scrub">
                <span className="av-scrub-label">Scrub</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.001}
                  value={progress}
                  onChange={onScrub}
                  disabled={ragdollActive}
                />
              </label>
            </div>
            <div className="av-appearance">
              <label>
                Species
                <select className="me-name" value={species} onChange={(e) => setSpecies(e.target.value)}>
                  {SPECIES.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Gender
                <select className="me-name" value={gender} onChange={(e) => setGender(e.target.value)}>
                  <option value="male">male</option>
                  <option value="female">female</option>
                </select>
              </label>
              <label>
                Hair
                <select className="me-name" value={hairStyle} onChange={(e) => setHairStyle(e.target.value)}>
                  {HAIR_STYLES.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Uniform
                <select className="me-name" value={division} onChange={(e) => setDivision(e.target.value)} disabled={species === 'klingon'}>
                  {UNIFORM_DIVISION_IDS.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </section>

        <aside className="av-ragdoll-pane combat-panel">
          <div className="av-ragdoll-head">
            <strong className="av-ragdoll-title">Ragdoll</strong>
            <button type="button" className="me-button" onClick={resetRagdollSettings}>
              Defaults
            </button>
          </div>
          <p className="me-text av-ragdoll-note">
            Tweaks apply on the next Ragdoll. Gravity updates live if physics is already up.
          </p>
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
          {RAGDOLL_GROUPS.map((group) => (
            <div key={group} className="av-ragdoll-group">
              <h3 className="av-ragdoll-group-label">{group}</h3>
              {RAGDOLL_SETTING_FIELDS.filter((f) => f.group === group).map((field) => (
                <label key={field.key} className="av-ragdoll-field">
                  <span className="av-ragdoll-field-label">
                    <span>{field.label}</span>
                    <span className="av-ragdoll-field-value">{formatSetting(field.key, ragdollSettings[field.key])}</span>
                  </span>
                  <input
                    type="range"
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    value={ragdollSettings[field.key]}
                    onChange={(e) => setRagdollField(field.key, Number(e.target.value))}
                  />
                </label>
              ))}
            </div>
          ))}
          <div className="av-ragdoll-group">
            <h3 className="av-ragdoll-group-label">Settle flags</h3>
            <label className="av-check">
              <input
                type="checkbox"
                checked={ragdollSettings.freezeOnFloor}
                onChange={(e) => setRagdollField('freezeOnFloor', e.target.checked)}
              />
              Freeze on floor hit
            </label>
            <label className="av-check">
              <input
                type="checkbox"
                checked={ragdollSettings.dampRamp}
                onChange={(e) => setRagdollField('dampRamp', e.target.checked)}
              />
              Damping ramp
            </label>
          </div>
        </aside>
      </div>
    </EditorSubScreen>
  )
}
