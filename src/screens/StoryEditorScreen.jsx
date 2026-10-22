import { useMemo, useState } from 'react'
import EditorSubScreen from '../components/maps/EditorSubScreen.jsx'
import { STORY_TEMPLATES, storyParagraphs } from '../exploration/missionStory.js'
import { canEditStory, saveStoryTemplates } from '../exploration/storyFiles.js'

// Dev Story Wording editor (opened from the map editor): the templates the outro tells the Captain's Log with
// (missionLog.json story), shared by every map. Save writes them to the file; a sample mission shows the result.
// onBack(): back to the map editor.
const FIELDS = [
  { key: 'objectiveActive', label: 'An objective becomes active', hint: '{action}: its title, starting lower case.' },
  { key: 'objectiveComplete', label: 'An objective is complete', hint: '{action}' },
  { key: 'checkSuccess', label: 'A conversation Task Check succeeds', hint: '{npc}, {performer}, {label}: the check, starting lower case.' },
  { key: 'checkFailure', label: 'A conversation Task Check fails', hint: '{npc}, {performer}, {label}' },
  { key: 'unnamedCheck', label: 'A check with no label', hint: 'Used as {label}.' },
  { key: 'taskSuccess', label: 'A challenge-object task succeeds', hint: '{object}, {performer}, {label}: the action, lower case.' },
  { key: 'taskFailure', label: 'A challenge-object task fails', hint: '{object}, {performer}, {label}' },
  { key: 'fightStartedByUs', label: 'The away team starts a fight', hint: '{attacker}, {target}' },
  { key: 'fightStartedByThem', label: 'Enemies start a fight', hint: '{enemies}' },
  { key: 'fightVictory', label: 'A fight is won', hint: '' },
  { key: 'fightDefeat', label: 'A fight is lost', hint: '' },
  { key: 'fightBrokeOff', label: 'A fight ends otherwise', hint: '' },
  { key: 'fightDown', label: 'Enemies went down', hint: '{names}' },
  { key: 'fightSurrendered', label: 'Enemies surrendered', hint: '{names}' },
  { key: 'fightFled', label: 'Enemies fled', hint: '{names}' },
  { key: 'fightFallen', label: 'Away team fell', hint: '{names}' },
  { key: 'beamOut', label: 'Beaming out', hint: '{names}: everyone who beamed out together.' },
]

const SAMPLE_ENTRIES = [
  { story: { event: 'objectiveActive', title: 'Restore power to the brig' } },
  { story: { event: 'checkSuccess', performer: 'Lt. Reyes', label: 'Reassure her', npc: 'Ensign Varn' } },
  { story: { event: 'taskFailure', performer: 'Lt. Reyes', label: 'Bypass the Lock', object: 'brig door' } },
  { story: { event: 'taskSuccess', performer: 'Cmdr. Okafor', label: 'Replace the EPS Coupling', object: 'EPS junction' } },
  { story: { event: 'objectiveComplete', title: 'Restore power to the brig' } },
  { story: { event: 'fightStartedByThem', enemies: ['Kor', 'Vek'] } },
  { story: { event: 'fightEnded', outcome: 'victory', down: ['Kor'], surrendered: ['Vek'], fled: [], fallen: ['Ensign Tal'] } },
  { story: { event: 'beamOut', name: 'Lt. Reyes' } },
  { story: { event: 'beamOut', name: 'Cmdr. Okafor' } },
]

export default function StoryEditorScreen({ onBack }) {
  const [draft, setDraft] = useState(() => ({ ...STORY_TEMPLATES }))
  const [saved, setSaved] = useState(() => ({ ...STORY_TEMPLATES }))
  const [status, setStatus] = useState('')
  const dirty = FIELDS.some(({ key }) => draft[key] !== saved[key])
  const preview = useMemo(() => storyParagraphs(SAMPLE_ENTRIES, draft), [draft])
  const empty = FIELDS.filter(({ key }) => !draft[key]?.trim())

  const save = async () => {
    try {
      const result = await saveStoryTemplates(draft)
      setSaved({ ...result })
      setDraft({ ...result })
      setStatus('Saved to missionLog.json.')
    } catch (error) {
      setStatus(`Could not save: ${error.message}`)
    }
  }

  return (
    <EditorSubScreen
      title="Story Wording"
      toolbar={
        <>
          <button type="button" className="me-button" onClick={onBack}>
            {dirty ? 'Back (discard changes)' : 'Back to Map'}
          </button>
          <button type="button" className="me-button" disabled={!canEditStory || !dirty || empty.length > 0} onClick={save}>
            Save Wording
          </button>
          <button type="button" className="me-button" disabled={!dirty} onClick={() => setDraft({ ...saved })}>
            Revert
          </button>
          <span className="me-text">
            {status || 'How the outro retells the Captain\u2019s Log, for every map. Authored log entries are told as written.'}
            {!canEditStory && ' Saving needs the dev server.'}
          </span>
        </>
      }
    >
      <div className="oe-detail">
        <div className="ce-inspector">
          {FIELDS.map(({ key, label, hint }) => (
            <label key={key} className="ce-field">
              <span className="ce-field-label">
                {label}
                {hint && ` \u2014 ${hint}`}
              </span>
              <input className="ce-input" value={draft[key] ?? ''} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} />
            </label>
          ))}
        </div>
      </div>
      <div className="oe-detail">
        <p className="ce-heading">Sample outro</p>
        {preview.map((paragraph) => (
          <p key={paragraph} className="ce-text">
            {paragraph}
          </p>
        ))}
        <p className="ce-heading">Warnings</p>
        {empty.length ? (
          <ul className="ce-warnings">
            {empty.map(({ key, label }) => (
              <li key={key}>{label} has no wording.</li>
            ))}
          </ul>
        ) : (
          <p className="ce-text">None</p>
        )}
      </div>
    </EditorSubScreen>
  )
}
