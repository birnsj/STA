import { useCallback, useState } from 'react'
import { controllerFor } from '../actors/controllers.js'
import { CombatLinkPanel } from '../components/exploration/ExplorationDebugPanels.jsx'
import { dispositionName, getNpcs, isHostile, stateName } from '../exploration/awareness.js'
import { getChallengeViews } from '../exploration/challengeObjects.js'
import { getCombatDiagnostics, getCombatObjects, previewCombatObject, recommendCombatObject } from '../exploration/combatLink.js'
import { getEntityKnowledge, isVisibleToParty, KNOWLEDGE } from '../exploration/partyKnowledge.js'
import { normalizeCondition } from '../rules/personalCondition.js'
import { Battle } from './CombatScreen.jsx'

// Combat over the same world: the exploration view is swapped for the combat battlefield on the same map, with
// everyone where they stood. Exploration stays frozen underneath until the result's Return to Exploration.
export default function WorldCombat({ state, dispatch, debugOpen, onDebug, onExit }) {
  const { combat, link, world } = state
  // Test options for Auto Combat, as on the combat screen.
  const [partyAI, setPartyAI] = useState('classic')
  const [enemyAI, setEnemyAI] = useState('classic')
  const combatDispatch = useCallback((action) => dispatch({ type: 'combat', action }), [dispatch])
  // The battlefield shows only what the away team sees; enemies it has lost leave a marker where last seen.
  const knowledge = state.partyKnowledge
  const hiddenIds = Object.values(combat.combatants)
    .filter((unit) => unit.side === 'enemy' && !isVisibleToParty(knowledge, unit.id))
    .map((unit) => unit.id)
  const lastKnownMarks = getNpcs(world)
    .map((npc) => ({ npc, entry: getEntityKnowledge(knowledge, npc.id) }))
    .filter(({ npc, entry }) => entry.state === KNOWLEDGE.KNOWN && !combat.combatants[npc.id]?.fled)
    .map(({ npc, entry }) => ({ id: npc.id, position: entry.lastKnownPosition, label: debugOpen ? npc.name : entry.identified ? null : 'Life sign' }))
  const bystanders = getNpcs(world)
    .filter((npc) => !link.npcIds.includes(npc.id) && npc.character && isVisibleToParty(knowledge, npc.id))
    .map((npc) => ({ id: npc.id, character: npc.character, position: npc.position, facing: controllerFor(npc).facing(npc), condition: normalizeCondition(npc.condition), hostile: isHostile(npc) }))
  const trigger = combat.combatants[link.trigger.npcId]
  const target = combat.combatants[link.trigger.targetId]
  const openingFocus = trigger && target ? { x: (trigger.position.x + target.position.x) / 2, y: (trigger.position.y + target.position.y) / 2 } : (trigger?.position ?? null)
  const [openingBanner] = useState(() => ({
    title: 'Combat',
    subtitle: !target ? null : trigger && isVisibleToParty(knowledge, trigger.id) ? `${trigger.character.name} engages ${target.character.name}` : `${target.character.name} has been spotted`,
  }))
  const diagnostics = debugOpen ? getCombatDiagnostics(state) : null
  // The same challenge objects as in exploration, usable by whoever acts (combatLink.js runs them).
  const objectList = getCombatObjects(state)
  const objects = {
    list: objectList,
    preview: (objectId, actionId) => previewCombatObject(state, objectId, actionId),
    recommend: (objectId, actionId, memberIds) => recommendCombatObject(state, objectId, actionId, memberIds),
    marks: getChallengeViews(state.scenario).map((view) => ({
      id: view.id,
      name: view.name,
      position: view.position,
      stateLabel: view.stateLabel,
      inReach: objectList.some((entry) => entry.definition.id === view.id),
    })),
  }
  return (
    <Battle
      objects={objects}
      state={combat}
      dispatch={combatDispatch}
      showHelpOnStart={false}
      onHelpSeen={() => {}}
      partyAI={partyAI}
      onPartyAI={setPartyAI}
      enemyAI={enemyAI}
      onEnemyAI={setEnemyAI}
      onExit={onExit}
      onContinue={() => dispatch({ type: 'endCombat' })}
      bystanders={bystanders}
      hiddenIds={hiddenIds}
      lastKnownMarks={lastKnownMarks}
      openingBanner={openingBanner}
      snapMarks={diagnostics?.snaps ?? null}
      openingFocus={openingFocus}
      debugOpen={debugOpen}
      onDebug={onDebug}
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
