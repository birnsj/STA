import missionLogData from '../../data/adaptation/exploration/missionLog.json'
import { MAX_AWAY_TEAM } from '../../exploration/awayTeam.js'
import { authoredDefinitionsFor } from '../../exploration/challengeObjects.js'
import { getTile, isRotated, mapFileId } from '../../maps/mapFormat.js'
import { randomMapName } from '../../maps/mapGenerators.js'
import { weatherFor } from '../../maps/mapWeather.js'
import { randomEpisodeName } from '../../rules/locationNames.js'
import EditorControlsHelp from './EditorControlsHelp.jsx'
import EpisodeCardPicker from './EpisodeCardPicker.jsx'

// The map editor's right-hand panel: the inspectors (children), then the episode, generate, Captain's Log, objective,
// challenge object and conversation sections, the file, the tile under the pointer, warnings and controls.
// map and edit(map): the map being edited. cardTools: { canGenerate, busy, onGenerate } for the episode card.
// onGenerateMap(): Generate Map. generateHazards / onGenerateHazards: checkbox so Generate Map also scatters hazards.
// onOpenObjective(index) / onOpenObjects() / onOpenStory() / onOpenConversations(): the full-screen editors.
export default function EditorSidePanel({
  map,
  edit,
  fileId,
  hoverTile,
  placing,
  rotated,
  warnings,
  status,
  showWeather,
  cardTools,
  placingObjective,
  canSave,
  onGenerateMap,
  generateHazards = false,
  onGenerateHazards,
  onOpenObjective,
  onOpenConversations,
  onOpenObjects,
  onOpenStory,
  children,
}) {
  const objectives = map.objectives ?? []
  const objectCount = authoredDefinitionsFor(map).length
  return (
    <div className="me-side">
      {children}
      <p className="me-heading">Episode Name</p>
      <input
        className="me-name me-episode"
        value={map.episodeName}
        placeholder="Shown in Load Episode"
        aria-label="Episode name"
        onChange={(event) => edit({ ...map, episodeName: event.target.value })}
      />
      <button type="button" className="me-button me-generate" onClick={() => edit({ ...map, episodeName: randomEpisodeName(map.episodeName, Math.random, map.name) })}>
        Generate Episode Name
      </button>
      <p className="me-text">The map name is the mission location.</p>
      <p className="me-heading">Episode Card</p>
      <EpisodeCardPicker
        cardId={map.card}
        weatherFx={showWeather ? weatherFor(map.weather).fx : null}
        canGenerate={cardTools.canGenerate}
        busy={cardTools.busy}
        onCard={(card) => edit({ ...map, card })}
        onGenerate={cardTools.onGenerate}
      />
      <p className="me-text">Shown in Load Episode. Generate Card draws a new picture for the location, biome and weather; Save keeps it under the map name.</p>
      <p className="me-heading">Generate</p>
      <button type="button" className="me-button me-generate" onClick={() => edit({ ...map, name: randomMapName(map) })}>
        Generate Name
      </button>
      <button
        type="button"
        className="me-button me-generate"
        title="Builds a new map of this type at the current size with a random name, episode name and episode card. Nothing is saved until you press Save."
        onClick={onGenerateMap}
      >
        Generate Map
      </button>
      <label className="me-check">
        <input
          type="checkbox"
          checked={generateHazards}
          onChange={(event) => onGenerateHazards?.(event.target.checked)}
        />
        Generate hazards
      </label>
      <p className="me-text">
        Uses the location, biome and size next to the name, and the Room size and Building size in the top bar (rooms never go below 4 tiles
        across). When Generate hazards is checked, the new map also gets scattered hazard regions. Nothing is saved until you press Save.
      </p>
      <p className="me-heading">Captain&apos;s Log</p>
      <label className="me-field">
        Starting stardate
        <input
          className="me-name me-wide"
          type="number"
          step="0.1"
          value={map.stardate ?? ''}
          placeholder={`Default ${missionLogData.defaultStardate}`}
          onChange={(event) => edit({ ...map, stardate: event.target.value === '' ? null : Number(event.target.value) })}
        />
      </label>
      <label className="me-field">
        Briefing (intro)
        <textarea
          className="me-name me-wide"
          rows={6}
          value={map.briefing ?? ''}
          placeholder="What the away team knows when the episode starts, shown as the Captain's Log intro. A blank line starts a new paragraph."
          onChange={(event) => edit({ ...map, briefing: event.target.value })}
        />
      </label>
      <label className="me-field">
        Outro
        <textarea
          className="me-name me-wide"
          rows={6}
          value={map.outro ?? ''}
          placeholder="The Captain's Log outro, shown once the away team has beamed out with every objective complete, before the story of the mission. A blank line starts a new paragraph."
          onChange={(event) => edit({ ...map, outro: event.target.value })}
        />
      </label>
      <label className="me-field">
        Outro (abandoned)
        <textarea
          className="me-name me-wide"
          rows={4}
          value={map.outroAbandoned ?? ''}
          placeholder="Shown instead of the Outro when the away team beams out before every objective is complete. Blank: “The away team beamed out before the mission was complete. Mission abandoned.”"
          onChange={(event) => edit({ ...map, outroAbandoned: event.target.value })}
        />
      </label>
      <label className="me-field">
        Outro (failed)
        <textarea
          className="me-name me-wide"
          rows={4}
          value={map.outroFailed ?? ''}
          placeholder="Shown instead of the Outro when the mission failed (the away team fought an NPC marked Must survive). Blank: “We failed to protect {names}. Mission failed.”"
          onChange={(event) => edit({ ...map, outroFailed: event.target.value })}
        />
      </label>
      <button type="button" className="me-button me-generate" onClick={onOpenStory}>
        Story Wording
      </button>
      <p className="me-text">How the outro retells the mission log (shared by every map).</p>
      <p className="me-heading">Objectives</p>
      {objectives.length ? (
        <ul className="me-objective-list">
          {objectives.map((objective, index) => (
            <li key={index}>
              <button type="button" className="me-link" onClick={() => onOpenObjective(index)}>
                O{index + 1} · {objective.title || objective.id}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="me-text">None yet.</p>
      )}
      {placingObjective !== null && <p className="me-text">Click a tile to mark the objective (Escape cancels).</p>}
      <button type="button" className="me-button me-generate" onClick={() => onOpenObjective(0)}>
        Objective Editor
      </button>
      <p className="me-heading">Challenge Objects</p>
      <p className="me-text">
        {objectCount ? `${objectCount} on this map` : 'None yet.'}
        {map.objects ? ' (saved with the map).' : objectCount ? ' (from challenges.json until edited here).' : ''}
      </p>
      <button type="button" className="me-button me-generate" onClick={onOpenObjects}>
        Object Editor
      </button>
      <p className="me-heading">Conversations</p>
      <button type="button" className="me-button me-generate" onClick={onOpenConversations}>
        Conversation Editor
      </button>
      <p className="me-heading">File</p>
      <p className="me-text">{fileId ? `maps/${fileId}.json` : 'Not saved yet'}</p>
      {fileId && mapFileId(map.name) && mapFileId(map.name) !== fileId && <p className="me-text">Renamed to maps/{mapFileId(map.name)}.json on Save.</p>}
      <p className="me-heading">Tile</p>
      <p className="me-text">
        {hoverTile ? `${hoverTile.x}, ${hoverTile.y}: ${getTile(map.tiles[hoverTile.y][hoverTile.x]).label}${isRotated(map, hoverTile) ? ' (rotated)' : ''}` : '-'}
      </p>
      <p className="me-text">Brush: {placing ? (rotated ? 'rotated' : 'not rotated') : 'off (Place Tiles)'}</p>
      <p className="me-heading">Player Starts</p>
      <p className="me-text">
        {map.markers.playerStarts.length} / {MAX_AWAY_TEAM}. Combat and Play field up to eight; anyone past these starts stands beside them.
      </p>
      <p className="me-heading">Warnings</p>
      {warnings.length ? (
        <ul className="me-warnings">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : (
        <p className="me-text">None</p>
      )}
      <EditorControlsHelp />
      {!canSave && <p className="me-text is-warning">Saving only works from the dev server.</p>}
      {status && <p className="me-status">{status}</p>}
    </div>
  )
}
