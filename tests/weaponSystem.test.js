// Weapons, range bands and the standard-issue loadout (combat/weaponSystem.js, combat/encounters.js).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { armedForWorldCombat, getEncounter, WORLD_ENCOUNTER_ID } from '../src/combat/encounters.js'
import { getCharacterWeapons, getRangeModifier, getWeapon, withStandardIssue } from '../src/combat/weaponSystem.js'
import { getRangeBand, RANGE_BANDS } from '../src/combat/rangeSystem.js'
import { makeCharacter } from './support/characters.js'

const names = (character) => getCharacterWeapons(character).map((weapon) => weapon.name)

describe('the weapons a character can use', () => {
  it('the Unarmed Strike is always available', () => {
    assert.deepEqual(names(makeCharacter()), ['Unarmed Strike'])
  })

  it('carried equipment is matched to a weapon by itemId', () => {
    const armed = makeCharacter({ equipment: [{ itemId: 'phaserType2' }] })
    assert.ok(names(armed).includes('Type-2 Phaser'))
    assert.ok(names(armed).includes('Unarmed Strike'), 'and they can still punch')
  })

  it('equipment that is not a weapon is ignored', () => {
    assert.deepEqual(names(makeCharacter({ equipment: [{ itemId: 'standardTricorder' }] })), ['Unarmed Strike'])
  })
})

describe('the standard-issue weapon', () => {
  it('is given to a character who brings no weapon of their own', () => {
    const issued = withStandardIssue(makeCharacter(), 'phaserType2')
    assert.ok(names(issued).includes('Type-2 Phaser'))
  })

  it('is not given to a character who already carries one', () => {
    const ownWeapon = makeCharacter({ equipment: [{ itemId: 'dkTahg' }] })
    const issued = withStandardIssue(ownWeapon, 'phaserType2')
    assert.equal(issued, ownWeapon, 'the character is handed back untouched')
    assert.ok(!names(issued).includes('Type-2 Phaser'))
  })

  it('leaves the character record alone: the weapon is only added to a copy', () => {
    const character = makeCharacter()
    const issued = withStandardIssue(character, 'phaserType2')
    assert.deepEqual(character.equipment, [], 'the original still carries nothing')
    assert.notEqual(issued, character)
  })

  it('does nothing without a weapon to issue', () => {
    const character = makeCharacter()
    assert.equal(withStandardIssue(character, null), character)
    assert.equal(withStandardIssue(character, 'noSuchWeapon'), character)
  })

  it('the exploration party card shows the weapon the character will actually fight with', () => {
    const issued = getEncounter(WORLD_ENCOUNTER_ID).standardIssueWeapon
    assert.ok(getWeapon(issued), `the world encounter issues '${issued}', which must exist in weapons.json`)
    assert.ok(names(armedForWorldCombat(makeCharacter())).includes(getWeapon(issued).name))
    // Someone with their own weapon keeps it.
    const klingon = makeCharacter({ equipment: [{ itemId: 'dkTahg' }] })
    assert.ok(!names(armedForWorldCombat(klingon)).includes(getWeapon(issued).name))
  })
})

describe('range', () => {
  const phaser = getWeapon('phaserType2')
  const band = (id) => RANGE_BANDS.find((entry) => entry.id === id)

  it('within optimal range there is no penalty', () => {
    assert.deepEqual(getRangeModifier(phaser, band(phaser.optimalRange)), { available: true, modifier: 0 })
    assert.equal(getRangeModifier(phaser, band('reach')).modifier, 0, 'closer than optimal is no harder')
  })

  it('each band beyond optimal adds 1 Difficulty, and beyond maximum the shot is unavailable', () => {
    const rifle = getWeapon('phaserRifle')
    const optimal = RANGE_BANDS.findIndex((entry) => entry.id === rifle.optimalRange)
    const beyond = RANGE_BANDS[optimal + 1]
    if (beyond) assert.equal(getRangeModifier(rifle, beyond).modifier, 1)
    const melee = getWeapon('dkTahg')
    const far = RANGE_BANDS[RANGE_BANDS.length - 1]
    assert.equal(getRangeModifier(melee, far).available, false, 'a blade cannot reach across the room')
  })

  it('distance in tiles maps onto a band', () => {
    assert.equal(getRangeBand(0).id, RANGE_BANDS[0].id)
    const far = getRangeBand(999)
    assert.equal(far.maxTiles, null, 'the furthest band is open-ended')
  })
})
