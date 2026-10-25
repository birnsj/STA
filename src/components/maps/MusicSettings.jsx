import { useEffect, useState } from 'react'
import { DEFAULT_CUE_FILES, EPISODE_CUES, emptyMusic } from '../../audio/musicCues.js'
import { listMusicFiles } from '../../audio/musicFiles.js'

// The episode's music: the tracks its intro, exploration, fights and outro play (map.music). A cue left alone plays the
// default. Exploration and Combat take several files and play them in random order.
export default function MusicSettings({ map, edit }) {
  // UI state: the MP3s in music/ (null until the dev server has answered).
  const [files, setFiles] = useState(null)
  useEffect(() => {
    let current = true
    listMusicFiles().then((list) => current && setFiles(list))
    return () => {
      current = false
    }
  }, [])

  const music = map.music ?? emptyMusic()
  const setCue = (id, value) => edit({ ...map, music: { ...music, [id]: value } })

  return (
    <>
      {EPISODE_CUES.map((cue) => {
        const chosen = cue.several ? music[cue.id] : music[cue.id] ? [music[cue.id]] : []
        // A file the map names stays listed even when it is not in music/ on this machine. The cue's own default files
        // come first, then the rest.
        const own = DEFAULT_CUE_FILES[cue.id]
        const names = [...new Set([...(files ?? []), ...chosen])].sort((a, b) => Number(own.includes(b)) - Number(own.includes(a)) || a.localeCompare(b))
        const label = (name) => (files && !files.includes(name) ? `${name} (missing)` : name)
        const defaults = DEFAULT_CUE_FILES[cue.id].join(', ')
        return cue.several ? (
          <fieldset key={cue.id} className="me-field me-music">
            <legend>{cue.label}</legend>
            <div className="me-music-list">
              {names.map((name) => (
                <label key={name} className="me-check">
                  <input
                    type="checkbox"
                    checked={chosen.includes(name)}
                    onChange={(event) => setCue(cue.id, event.target.checked ? [...chosen, name] : chosen.filter((other) => other !== name))}
                  />{' '}
                  {label(name)}
                </label>
              ))}
            </div>
            <p className="me-text is-muted">{chosen.length ? 'Played in random order.' : `None chosen: plays ${defaults}.`}</p>
          </fieldset>
        ) : (
          <label key={cue.id} className="me-field">
            {cue.label}
            <select className="me-select me-wide" value={chosen[0] ?? ''} aria-label={cue.label} onChange={(event) => setCue(cue.id, event.target.value || null)}>
              <option value="">Default ({defaults})</option>
              {names.map((name) => (
                <option key={name} value={name}>
                  {label(name)}
                </option>
              ))}
            </select>
          </label>
        )
      })}
      {files?.length === 0 && <p className="me-text is-muted">No MP3s found in music/ (only the dev server can list them).</p>}
    </>
  )
}
