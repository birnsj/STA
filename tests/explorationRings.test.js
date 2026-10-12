// The NPC radial menu asks the NPC's controller whether they can talk, so the button and the rest of the game agree.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import brigFile from '../maps/Deck 10 Brig.json'
import { controllerFor } from '../src/actors/controllers.js'
import { npcMenuButtons } from '../src/components/exploration/explorationRings.js'
import { getNpcs } from '../src/exploration/awareness.js'
import { createExplorationState } from '../src/exploration/explorationState.js'
import { parseMapFile } from '../src/maps/mapFormat.js'
import { makeCharacter } from './support/characters.js'

const noActions = { talk() {}, scan() {}, info() {}, attack() {}, goTo() {} }
const talkButton = (state, npc) => npcMenuButtons(state, npc, true, false, noActions).find((button) => button.id === 'talk')

describe('NPC menu Talk button', () => {
  const state = createExplorationState(parseMapFile({ ...brigFile, objectPlacements: {} }, 'Deck 10 Brig'), [makeCharacter({ id: 'alpha', name: 'Alpha' })], 3, { enemiesActive: false })
  const npcs = getNpcs(state.world)

  it('matches the controller for every NPC on the map', () => {
    assert.ok(npcs.length > 0)
    for (const npc of npcs) assert.equal(talkButton(state, npc).enabled, controllerFor(npc).canTalk(npc), npc.id)
  })

  it('is off without a conversation and on with one while they are up', () => {
    const [npc] = npcs
    const quiet = { ...npc, conversationId: null }
    const talker = { ...npc, conversationId: 'anything' }
    assert.equal(talkButton(state, quiet).enabled, false)
    assert.equal(talkButton(state, talker).enabled, controllerFor(talker).isUp(talker))
  })
})
