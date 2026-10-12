// The outro's retelling of the Captain's Log (exploration/missionStory.js).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { joinNames, storyParagraphs } from '../src/exploration/missionStory.js'

const entry = (story, text = 'as written') => ({ id: 1, time: 0, kind: 'test', text, story })

describe('mission story', () => {
  it('tells objectives in the captain\'s voice and closes a paragraph on each completed one', () => {
    const paragraphs = storyParagraphs([
      entry({ event: 'objectiveActive', title: 'Restore power to the section' }),
      entry({ event: 'objectiveComplete', title: 'Restore power to the section.' }),
      entry({ event: 'objectiveActive', title: "Get Lt. Okafor's clearance" }),
    ])
    assert.deepEqual(paragraphs, [
      'Our next task was to restore power to the section. We managed to restore power to the section.',
      "Our next task was to get Lt. Okafor's clearance.",
    ])
  })

  it('keeps an acronym capitalised, tells authored entries as written and checks with their outcome', () => {
    const [paragraph] = storyParagraphs([
      entry({ event: 'objectiveActive', title: 'EPS junction online' }),
      entry(null, 'Okafor gave us her codes.'),
      entry({ event: 'checkSuccess', performer: 'Varga', label: 'Reassure her', npc: 'Lt. Okafor' }),
      entry({ event: 'checkFailure', performer: 'Strand', label: '', npc: 'the guard' }),
    ])
    assert.equal(
      paragraph,
      'Our next task was to EPS junction online. Okafor gave us her codes. With Lt. Okafor, Varga tried to reassure her, and it worked. With the guard, Strand tried to win them over, but it came to nothing.',
    )
  })

  it('tells object tasks with their title-case label lowered, and a fight as its own paragraph', () => {
    const paragraphs = storyParagraphs([
      entry({ event: 'taskSuccess', performer: 'Petrov', label: 'Replace the EPS Coupling', object: 'EPS Power Junction' }),
      entry({ event: 'fightStartedByThem', enemies: ['Kor', 'Vek'] }),
      entry({ event: 'fightEnded', outcome: 'victory', down: ['Kor'], surrendered: [], fled: ['Vek'], fallen: ['Strand'] }),
      entry(null, 'We moved on.'),
    ])
    assert.deepEqual(paragraphs, [
      'At the EPS Power Junction, Petrov tried to replace the EPS coupling, and it worked.',
      'Kor and Vek attacked us. The fight was ours. Kor went down. Vek fled. Strand fell in the fight.',
      'We moved on.',
    ])
  })

  it('tells characters beaming out one after another in one sentence', () => {
    const paragraphs = storyParagraphs(['A', 'B', 'C'].map((name) => entry({ event: 'beamOut', name })))
    assert.deepEqual(paragraphs, ['A, B and C beamed back aboard.'])
    assert.equal(joinNames(['A', 'B']), 'A and B')
    assert.deepEqual(storyParagraphs([]), [])
  })

  it('tells the story with other wording when given it (the Story Wording preview)', () => {
    const paragraphs = storyParagraphs([entry({ event: 'beamOut', name: 'A' })], { beamOut: '{names} went home.' })
    assert.deepEqual(paragraphs, ['A went home.'])
  })
})
