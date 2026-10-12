// The map editor's Object Editor: map-owned challenge objects (mapFormat.js objects), the authoring helpers
// (world/objectAuthoring.js) and the abandoned outro text.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { setStoryTemplates } from '../tools/storyStore.cjs'
import { challengeDefinitionsFor, createScenario, definitionProblemsFor } from '../src/exploration/challengeObjects.js'
import { createBlankMap, parseMapFile, serializeMap } from '../src/maps/mapFormat.js'
import {
  createAction,
  createObject,
  editableObjects,
  moveObject,
  objectWarnings,
  renameAction,
  renameObjectInObjectives,
  renameState,
  withObjects,
} from '../src/world/objectAuthoring.js'

const brig = () => ({ ...createBlankMap({ name: 'Deck 10 Brig', width: 40, height: 40 }), id: 'Deck 10 Brig' })

describe('map-owned challenge objects', () => {
  it('uses challenges.json until the map has objects of its own, then only those', () => {
    const map = brig()
    assert.ok(challengeDefinitionsFor(map).some((object) => object.id === 'powerJunction01'))
    assert.deepEqual(challengeDefinitionsFor({ ...map, objects: [] }), [])
    const own = createObject([], map)
    assert.deepEqual(challengeDefinitionsFor({ ...map, objects: [own] }).map((object) => object.id), ['object1'])
  })

  it('saves and loads the objects and the abandoned outro with the map', () => {
    const map = { ...createBlankMap({ width: 8, height: 8 }), objects: [createObject([], { width: 8, height: 8 })], outroAbandoned: '  We left early.  ' }
    const saved = serializeMap(map)
    assert.equal(saved.outroAbandoned, 'We left early.')
    const loaded = parseMapFile(JSON.parse(JSON.stringify(saved)), 'test')
    assert.deepEqual(loaded.objects, map.objects)
    assert.equal(loaded.outroAbandoned, 'We left early.')
    const plain = parseMapFile(serializeMap(createBlankMap()), 'plain')
    assert.equal(plain.objects, null)
    assert.equal(plain.outroAbandoned, '')
  })

  it('takes the map placements in when the editor first saves the objects', () => {
    const map = { ...brig(), objectPlacements: { powerJunction01: { x: 5, y: 6 } } }
    const edited = withObjects(map, editableObjects(map))
    assert.deepEqual(edited.objectPlacements, {})
    assert.deepEqual(edited.objects.find((object) => object.id === 'powerJunction01').position, [5, 6])
    assert.deepEqual(challengeDefinitionsFor(edited), challengeDefinitionsFor(map))
  })
})

describe('malformed objects', () => {
  it('repairs what it can and leaves out what has no id, instead of crashing', () => {
    const map = {
      ...createBlankMap({ width: 8, height: 8 }),
      objects: [
        { id: 'panel', states: 'nope', actions: [{ id: 'a', label: 'A', onSuccess: 'x' }, { label: 'no id' }, { id: 'b', task: { attribute: 'reason' } }] },
        { name: 'no id' },
        null,
        { id: 'door', position: [2, 2], state: 'open', states: { open: { label: 'Open' } }, actions: 'x', covers: [[3, 2], 'bad'] },
      ],
    }
    const definitions = challengeDefinitionsFor(map)
    assert.deepEqual(definitions.map((object) => object.id), ['panel', 'door'])
    const [panel, door] = definitions
    assert.deepEqual(panel.position, [0, 0])
    assert.deepEqual(Object.keys(panel.states), ['default'])
    assert.equal(panel.state, 'default')
    assert.deepEqual(panel.actions.map((action) => action.id), ['a', 'b'])
    assert.equal(panel.actions[0].onSuccess, undefined)
    assert.deepEqual(door.actions, [])
    assert.deepEqual(door.covers, [[3, 2]])
    assert.ok(definitionProblemsFor(map).length >= 6)
    // Play leaves out actions it can't run: b has no Department.
    assert.deepEqual(createScenario(map).definitions[0].actions.map((action) => action.id), [])
    assert.ok(editableObjects(map).length === 2)
  })

  it('does not change well-formed objects', () => {
    const map = brig()
    assert.deepEqual(definitionProblemsFor(map), [])
    assert.equal(createScenario(map).definitions.find((object) => object.id === 'powerJunction01').actions.length, 3)
  })
})

describe('object authoring helpers', () => {
  it('renames an action and the Adjust Difficulty effects that name it', () => {
    const object = { states: { idle: {} }, actions: [{ id: 'scan', onSuccess: [{ type: 'adjustDifficulty', actionId: 'fix', change: -1 }] }, { id: 'fix' }] }
    const renamed = renameAction(object, 'fix', 'repair')
    assert.deepEqual(renamed.actions.map((action) => action.id), ['scan', 'repair'])
    assert.equal(renamed.actions[0].onSuccess[0].actionId, 'repair')
    assert.equal(renameAction(object, 'fix', 'scan'), object)
  })

  it('moves objectives marked on a renamed object with it', () => {
    const objectives = [{ id: 'o1', objectId: 'junction' }, { id: 'o2', objectId: 'door' }, { id: 'o3' }]
    assert.deepEqual(renameObjectInObjectives(objectives, 'junction', 'eps').map((objective) => objective.objectId), ['eps', 'door', undefined])
  })

  it('renames a state everywhere the object refers to it', () => {
    const object = editableObjects(brig()).find((entry) => entry.id === 'powerJunction01')
    const renamed = renameState(object, 'online', 'powered')
    assert.ok(renamed.states.powered && !renamed.states.online)
    assert.ok(renamed.actions[0].onSuccess.some((effect) => effect.type === 'setState' && effect.state === 'powered'))
    const offline = renameState(object, 'offline', 'dark')
    assert.equal(offline.state, 'dark')
    assert.deepEqual(offline.actions[0].requires.states, ['dark'])
    assert.equal(renameState(object, 'offline', 'online'), object)
  })

  it('moves an object with its extra tiles', () => {
    const moved = moveObject({ position: [2, 2], covers: [[3, 2]] }, [5, 4])
    assert.deepEqual(moved, { position: [5, 4], covers: [[6, 4]] })
  })

  it('warns about problems without blocking', () => {
    const map = createBlankMap({ width: 8, height: 8 })
    const object = createObject([], map)
    const action = { ...createAction(object), onSuccess: [{ type: 'setState', state: 'missing' }] }
    const warnings = objectWarnings([{ ...object, actions: [action] }, { ...object, position: [9, 9] }], { ...map, objectives: [{ id: 'o', title: 'O', objectId: 'gone' }] })
    assert.ok(warnings.some((text) => text.includes('used twice')))
    assert.ok(warnings.some((text) => text.includes('off the map')))
    assert.ok(warnings.some((text) => text.includes('unknown state missing')))
    assert.ok(warnings.some((text) => text.includes('marked on gone')))
    assert.deepEqual(objectWarnings(editableObjects(brig()), brig()), [])
  })
})

describe('story wording store', () => {
  it('changes only the templates the file has', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'story-')), 'missionLog.json')
    fs.writeFileSync(file, JSON.stringify({ notes: ['n'], story: { beamOut: '{names} beamed back aboard.' } }))
    assert.deepEqual(setStoryTemplates(file, { beamOut: ' {names} went home. ' }), { beamOut: '{names} went home.' })
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).story.beamOut, '{names} went home.')
    assert.throws(() => setStoryTemplates(file, { other: 'x' }), /Unknown/)
    assert.throws(() => setStoryTemplates(file, { beamOut: ' ' }), /needs some text/)
  })
})
