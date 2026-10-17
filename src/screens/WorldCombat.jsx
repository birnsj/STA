import { useCallback, useState } from 'react'
import { controllerFor } from '../actors/controllers.js'
import { CombatLinkPanel } from '../components/exploration/ExplorationDebugPanels.jsx'
import { dispositionName, getNpcs, isHostile, stateName } from '../exploration/awareness.js'
import { challengeFor, getChallengeViews } from '../exploration/challengeObjects.js'
import { activeHazards } from '../world/environment.js'
import { hazardChallengeId } from '../world/EnvironmentalHazard.js'
import { getCombatDiagnostics, getCombatObjects, previewCombatObject, recommendCombatObject } from '../exploration/combatLink.js'
import { foughtNpcIds, mustSurviveIds } from '../exploration/missionObjectives.js'
import { hideEnemyFromBoard } from '../exploration/boardVisibility.js'
import { getEntityKnowledge, isVisibleToParty, KNOWLEDGE } from '../exploration/partyKnowledge.js'
import { isDefeated, normalizeCondition } from '../rules/personalCondition.js'
import { hasCharacterHazardOverlay } from '../world/characterHazardOverlay.js'
import { objectFor } from '../world/objects.js'
import { Battle } from './CombatScreen.jsx'

// Combat over the same world: the exploration view is swapped for the combat battlefield on the same map, with
// everyone where they stood. Exploration stays frozen underneath until the result's Return to Exploration.
// onExitMission: ends the fight and beams the away team out (the result offers it when the fight failed the mission).
export default function WorldCombat({ state, dispatch, debugOpen, onDebug, onExit, onExitMission }) {
  const { combat, link, world } = state
  const combatDispatch = useCallback((action) => dispatch({ type: 'combat', action }), [dispatch])
  // The battlefield shows what the away team sees; burning / afflicted enemies and bodies that have fallen stay on the
  // board even out of sight. Upright enemies the party has lost leave a marker where last seen.
  const knowledge = state.partyKnowledge
  const environment = state.environment
  const revealedByHazard = (actor) =>
    hasCharacterHazardOverlay(environment, actor.position, actor.character, actor.condition)
  const hiddenIds = Object.values(combat.combatants)
    .filter((unit) => hideEnemyFromBoard(knowledge, unit, { revealed: revealedByHazard(unit) }))
    .map((unit) => unit.id)
  const lastKnownMarks = getNpcs(world)
    .map((npc) => ({ npc, entry: getEntityKnowledge(knowledge, npc.id), unit: combat.combatants[npc.id] }))
    .filter(({ npc, entry, unit }) => entry.state === KNOWLEDGE.KNOWN && !unit?.fled && !revealedByHazard(npc) && !isDefeated(unit?.condition ?? npc.condition))
    .map(({ npc, entry }) => ({ id: npc.id, position: entry.lastKnownPosition, label: debugOpen ? npc.name : entry.identified ? null : 'Life sign' }))
  const bystanders = getNpcs(world)
    .filter((npc) => !link.npcIds.includes(npc.id) && npc.character && (isVisibleToParty(knowledge, npc.id) || revealedByHazard(npc) || isDefeated(npc.condition)))
    .map((npc) => ({ id: npc.id, character: npc.character, position: npc.position, facing: controllerFor(npc).facing(npc), condition: normalizeCondition(npc.condition), hostile: isHostile(npc) }))
  const trigger = combat.combatants[link.trigger.npcId]
  const target = combat.combatants[link.trigger.targetId]
  const openingFocus = trigger && target ? { x: (trigger.position.x + target.position.x) / 2, y: (trigger.position.y + target.position.y) / 2 } : (trigger?.position ?? null)
  const [openingBanner] = useState(() => ({
    title: 'Combat',
    subtitle: !target ? null : trigger && isVisibleToParty(knowledge, trigger.id) ? `${trigger.character.name} engages ${target.character.name}` : `${target.character.name} has been spotted`,
  }))
  const diagnostics = debugOpen ? getCombatDiagnostics(state) : null
  const failedNames = foughtNpcIds(combat, mustSurviveIds(state.party.map)).map((id) => combat.combatants[id].character.name)
  // The same challenge objects as in exploration, usable by whoever acts (combatLink.js runs them).
  const objectList = getCombatObjects(state)
  const challengeViews = getChallengeViews(state.scenario)
  const objects = {
    list: objectList,
    preview: (objectId, actionId) => previewCombatObject(state, objectId, actionId),
    recommend: (objectId, actionId, memberIds) => recommendCombatObject(state, objectId, actionId, memberIds),
    marks: [
      ...challengeViews.map((view) => ({
        id: view.id,
        name: view.name,
        position: view.position,
        stateLabel: view.stateLabel,
        inReach: objectList.some((entry) => entry.definition.id === view.id),
      })),
      // Each hazard's Neutralize task, marked on its anchor tile (world/EnvironmentalHazard.js).
      ...activeHazards(state.environment)
        .filter((region) => region.neutralizable !== false)
        .map((region) => challengeFor(state, hazardChallengeId(region.id)))
        .filter(Boolean)
        .map((object) => ({
          id: object.id,
          name: object.definition.name,
          position: object.position(),
          stateLabel: 'Hazard',
          inReach: objectList.some((entry) => entry.definition.id === object.id),
        })),
    ],
  }
  const doors = challengeViews
    .map((view) => objectFor(state.scenario, view.id))
    .filter((object) => object.definition.type === 'door')
    .map((object) => {
      const doorState = object.runtime(state.scenario).state
      const info = object.definition.states[doorState] ?? {}
      return { id: object.id, name: object.definition.name, stateLabel: info.label ?? doorState, closed: Boolean(info.tile), cells: object.tiles() }
    })
  return (
    <Battle
      objects={objects}
      state={combat}
      dispatch={combatDispatch}
      showHelpOnStart={false}
      onHelpSeen={() => {}}
      onExit={onExit}
      onContinue={() => dispatch({ type: 'endCombat' })}
      failedNames={failedNames}
      onExitMission={onExitMission}
      bystanders={bystanders}
      hiddenIds={hiddenIds}
      lastKnownMarks={lastKnownMarks}
      openingBanner={openingBanner}
      snapMarks={diagnostics?.snaps ?? null}
      openingFocus={openingFocus}
      debugOpen={debugOpen}
      onDebug={onDebug}
      knowledge={knowledge}
      environment={environment}
      doors={doors}
      worldActors={debugOpen ? Object.fromEntries(getNpcs(world).map((npc) => [npc.id, { disposition: dispositionName(npc.disposition), awareness: stateName(npc.state) }])) : null}
    >
      {diagnostics && (
        <div className="world-combat-debug">
          <CombatLinkPanel diagnostics={diagnostics} onForceEnd={() => dispatch({ type: 'endCombat' })} />
        </div>
      )}
    </Battle>
  )
}
