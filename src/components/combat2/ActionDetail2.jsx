import { ACTION_SPECS, buildActionTask, getMoveOptions, getPhaser, getPlayer, previewPlayerAction, taskChance, TUNING, describeBlockedTile } from '../../combat2/actions2.js'
import { findCover } from '../../combat2/cover2.js'
import { tileKey } from '../../combat2/map2.js'

const percent = (chance) => `${(chance * 100).toFixed(2).replace(/\.?0+$/, '')}%`

function Row({ label, children, tone }) {
  return (
    <>
      <dt>{label}</dt>
      <dd className={tone ? `is-${tone}` : ''}>{children}</dd>
    </>
  )
}

// Attribute + Discipline = Target Number, Difficulty, Focus and the odds: the character sheet explained through the action.
function TaskRows({ task, difficultyNote }) {
  return (
    <>
      <Row label={task.attribute.name}>{task.attribute.value}</Row>
      <Row label={task.discipline.name}>{task.discipline.value}</Row>
      <Row label="Target Number">
        <b>{task.targetNumber}</b>
      </Row>
      <Row label="Difficulty">
        {task.difficulty} {difficultyNote && <span className="c2-muted">({difficultyNote})</span>}
      </Row>
      <Row label="Relevant Focus">{task.focus ?? 'None'}</Row>
    </>
  )
}

function MoveDetail({ state, hoverTile }) {
  const player = getPlayer(state)
  const options = getMoveOptions(state, player.id)
  const entry = hoverTile && options.get(tileKey(hoverTile))
  const blocked = hoverTile && !entry ? describeBlockedTile(state, player.id, hoverTile, options) : null
  const shooters = Object.entries(state.intents).filter(([, intent]) => intent.kind === 'shoot' || intent.kind === 'advance')
  return (
    <dl className="c2-detail-rows">
      <Row label="Move">Up to {TUNING.moveTiles} tiles (1 AP)</Row>
      {entry && entry.steps > 0 && <Row label="Path">{entry.steps} tiles</Row>}
      {entry &&
        entry.steps > 0 &&
        shooters
          .filter(([id]) => state.units[id].role === 'ranged')
          .map(([id]) => (
            <Row key={id} label={`vs ${state.units[id].character.name}`} tone={findCover(state.map, hoverTile, state.units[id].position) ? 'good' : null}>
              {findCover(state.map, hoverTile, state.units[id].position) ? 'In cover (Difficulty 2)' : 'Exposed'}
            </Row>
          ))}
      {blocked && (
        <Row label="Destination" tone="bad">
          {blocked}
        </Row>
      )}
      {!hoverTile && <Row label="Tip">Blue tiles are reachable. Red tiles are blocked or too far.</Row>}
    </dl>
  )
}

function TargetedDetail({ state, actionId, targetId }) {
  const player = getPlayer(state)
  const spec = ACTION_SPECS[actionId]
  if (actionId === 'phaser' && !getPhaser(player.character)) {
    const task = buildActionTask(player.character, 'phaser')
    return (
      <dl className="c2-detail-rows">
        <TaskRows task={task} />
        <Row label="Equipment" tone="bad">
          No phaser carried
        </Row>
      </dl>
    )
  }
  if (!targetId) {
    const task = buildActionTask(player.character, actionId)
    return (
      <dl className="c2-detail-rows">
        <TaskRows task={task} difficultyNote={actionId === 'phaser' ? '2 if the target is in cover' : null} />
        <Row label="Expected Success">{percent(taskChance(task.targetNumber, 1))}</Row>
        <Row label="Target">Point at a Klingon</Row>
      </dl>
    )
  }
  const target = state.units[targetId]
  const preview = previewPlayerAction(state, actionId, targetId)
  const difficultyNote = actionId === 'phaser' ? (preview.cover ? 'target in cover' : 'target exposed') : null
  return (
    <dl className="c2-detail-rows">
      <TaskRows task={preview.task} difficultyNote={difficultyNote} />
      {actionId === 'phaser' && <Row label="Equipment">{getPhaser(player.character).name}</Row>}
      <Row label="Expected Success">
        <b className="c2-chance">{percent(preview.chance)}</b>
      </Row>
      <Row label="Target">{target.character.name}</Row>
      {actionId === 'phaser' && (
        <>
          <Row label="Range" tone={preview.distance > preview.range ? 'bad' : null}>
            {preview.distance} / {preview.range}
          </Row>
          <Row label="Line of Sight" tone={preview.sight.clear ? null : 'bad'}>
            {preview.sight.clear ? 'Clear' : 'Blocked'}
          </Row>
          <Row label="Cover" tone={preview.cover ? 'bad' : 'good'}>
            {preview.cover ? 'In cover: both dice must succeed' : 'None'}
          </Row>
        </>
      )}
      {actionId === 'push' && preview.destination && (
        <Row label="Pushed to" tone={preview.intoHazard ? 'good' : null}>
          {preview.intoHazard ? 'Live EPS grating: +1 Hit' : preview.ontoGrating ? 'EPS grating (not discharging)' : 'Open deck'}
        </Row>
      )}
      <Row label="Result" tone={preview.available ? 'good' : 'bad'}>
        {preview.available ? `Click ${target.character.name} to ${spec.name.toLowerCase()} (1 AP)` : preview.reason}
      </Row>
    </dl>
  )
}

function InteractDetail({ state, onActivate }) {
  const player = getPlayer(state)
  const preview = previewPlayerAction(state, 'interact', null)
  return (
    <>
      <dl className="c2-detail-rows">
        <TaskRows task={preview.task} />
        <Row label="Expected Success">
          <b className="c2-chance">{percent(preview.chance)}</b>
        </Row>
        <Row label="Object">EPS conduit control</Row>
        <Row label="Effect">The grating discharges until your next turn. Anyone on it, or pushed onto it, takes 1 Hit.</Row>
        {!preview.available && (
          <Row label="Result" tone="bad">
            {preview.reason}
          </Row>
        )}
      </dl>
      <button type="button" className="c2-button is-primary" disabled={!preview.available || state.ap <= 0} onClick={onActivate}>
        Activate (1 AP) as {player.character.name.split(' ')[0]}
      </button>
    </>
  )
}

function LastRoll({ state }) {
  const event = [...state.events].reverse().find((item) => item.type === 'roll')
  if (!event) return null
  const actor = state.units[event.actorId].character.name
  const target = event.targetId ? state.units[event.targetId].character.name : null
  const name = event.actionId === 'disruptor' ? 'Disruptor' : ACTION_SPECS[event.actionId].name
  return (
    <div className="c2-last-roll">
      <p className="c2-panel-title">Last Roll</p>
      <p>
        {actor}: {name}
        {target ? ` \u2192 ${target}` : ''}
      </p>
      <p className="c2-dice">
        {event.dice.map((die, i) => (
          <span key={i} className={`c2-die${die.success ? ' is-success' : ''}`}>
            {die.value}
          </span>
        ))}
        <span className="c2-muted">
          TN {event.task.targetNumber}, {event.successes} / {event.task.difficulty} needed
        </span>
        <b className={event.passed ? 'is-good' : 'is-bad'}>{event.passed ? 'SUCCESS' : 'FAILURE'}</b>
      </p>
      {(event.momentum || event.threat) && (
        <p className="c2-muted">
          {[event.momentum && 'Momentum generated', event.threat && 'Threat generated (a 20)'].filter(Boolean).join(' \u00b7 ')}
        </p>
      )}
    </div>
  )
}

export default function ActionDetail2({ state, actionId, targetId, hoverTile, onActivate }) {
  const playerTurn = state.phase === 'player' && !state.outcome
  return (
    <div className="c2-panel c2-detail">
      <p className="c2-panel-title">{actionId ? ACTION_SPECS[actionId].name : 'Action'}</p>
      {state.phase === 'enemy' && <p className="c2-muted">The Klingons are acting.</p>}
      {state.outcome && <p className="c2-muted">Combat over.</p>}
      {playerTurn && !actionId && <p className="c2-muted">Choose an action below. Each costs 1 of your {TUNING.actionPoints} AP. Point at a Klingon to see its threat.</p>}
      {playerTurn && actionId === 'move' && <MoveDetail state={state} hoverTile={hoverTile} />}
      {playerTurn && ['phaser', 'melee', 'push'].includes(actionId) && <TargetedDetail state={state} actionId={actionId} targetId={targetId} />}
      {playerTurn && actionId === 'interact' && <InteractDetail state={state} onActivate={onActivate} />}
      <LastRoll state={state} />
    </div>
  )
}
