import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { HumanoidAnimator, isLoco } from '../src/spike3d/HumanoidAnimator.js'
import { animationViewerGroups, clipSeconds } from '../src/spike3d/clips.js'

describe('HumanoidAnimator seek / pause', () => {
  it('classifies loco vs action clips', () => {
    assert.equal(isLoco('walk'), true)
    assert.equal(isLoco('stepBack'), true)
    assert.equal(isLoco('phaser-attack01'), false)
    assert.equal(isLoco('fallBack'), false)
  })

  it('seeks an action clip to mid and end', () => {
    const anim = new HumanoidAnimator(null)
    anim.setViewerHoldOnce(true)
    assert.ok(anim.play('phaser-attack01', { force: true }))
    anim.seek(0.5)
    assert.ok(Math.abs(anim.progress - 0.5) < 1e-6)
    assert.equal(anim.actionDone, false)
    anim.seek(1)
    assert.ok(Math.abs(anim.progress - 1) < 1e-6)
    assert.equal(anim.actionDone, true)
  })

  it('pause freezes action time', () => {
    const anim = new HumanoidAnimator(null)
    anim.setViewerHoldOnce(true)
    anim.play('melee', { force: true })
    anim.seek(0.25)
    anim.setPaused(true)
    const before = anim.progress
    anim.update(0.05, null)
    assert.equal(anim.progress, before)
    anim.setPaused(false)
    anim.update(0.05, null)
    assert.ok(anim.progress > before)
  })

  it('seeks loco gait phase', () => {
    const anim = new HumanoidAnimator(null)
    anim.play('walk', { force: true })
    anim.seek(0.33)
    assert.ok(Math.abs(anim.progress - 0.33) < 1e-6)
    anim.seek(0)
    assert.ok(Math.abs(anim.progress) < 1e-6)
  })

  it('viewer once-clips hold at end instead of returning to idle', () => {
    const anim = new HumanoidAnimator(null)
    anim.setViewerHoldOnce(true)
    anim.play('punch', { force: true })
    const seconds = clipSeconds('punch')
    // update() caps dt at 0.1 — advance in steps.
    for (let t = 0; t < seconds + 0.05; t += 0.05) anim.update(0.05, null)
    assert.equal(anim.current, 'punch')
    assert.equal(anim.actionDone, true)
    assert.ok(anim.progress >= 0.99)
  })

  it('board once-clips still return to idle without viewer hold', () => {
    const anim = new HumanoidAnimator(null)
    anim.play('punch', { force: true })
    const seconds = clipSeconds('punch')
    for (let t = 0; t < seconds + 0.05; t += 0.05) anim.update(0.05, null)
    assert.equal(anim.current, 'idle')
  })
})

describe('animationViewerGroups', () => {
  it('lists sheet groups and 3D-only gaits', () => {
    const groups = animationViewerGroups()
    assert.ok(groups.length >= 5)
    const names = new Set(groups.flatMap((g) => g.clips.map((c) => c.name)))
    assert.ok(names.has('idle'))
    assert.ok(names.has('phaser-attack01'))
    assert.ok(names.has('stepBack'))
    const only = groups.find((g) => g.id === '3dOnly')
    assert.ok(only)
    assert.ok(only.clips.some((c) => c.name === 'hazardPanicRun'))
  })
})
