// Roll window wording (components/task/taskText.js): how bought dice are paid, and what a roll needs.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { dicePaymentText, needText } from '../src/components/task/taskText.js'
import { checkDicePurchase, defaultMomentumPayment } from '../src/rules/missionResources.js'

const paid = (resources, bonusDice) => checkDicePurchase(resources, { bonusDice, momentum: defaultMomentumPayment(resources, bonusDice) })

describe('roll window wording', () => {
  it('bought dice are paid with Momentum first; only the rest is Threat', () => {
    assert.equal(dicePaymentText(paid({ momentum: 4, threat: 0 }, 2)), 'Paid with 3 Momentum')
    assert.equal(dicePaymentText(paid({ momentum: 2, threat: 0 }, 2)), 'Pays 2 Momentum + gives the enemy 1 Threat')
    assert.equal(dicePaymentText(paid({ momentum: 0, threat: 0 }, 1)), 'No Momentum: gives the enemy 1 Threat')
    assert.equal(dicePaymentText(paid({ momentum: 0, threat: 0 }, 0)), 'Bonus dice cost Momentum, then Threat')
  })

  it('says how many successes are needed and which dice score', () => {
    assert.equal(needText({ targetNumber: 15, criticalRange: 1 }, 2), 'Need 2 successes · roll 15 or under on each d20')
    assert.equal(needText({ targetNumber: 12, criticalRange: 4 }, 1), 'Need 1 success · roll 12 or under (1–4 count twice)')
    assert.equal(needText({ targetNumber: 9, criticalRange: 1 }, 0), "Difficulty 0: can't fail · roll 9 or under on each d20")
  })
})
