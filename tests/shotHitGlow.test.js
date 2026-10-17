import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BEAM_SHOT_MS, PULSE_IMPACT_AFTER_MS, shotHitGlowAlpha } from '../src/components/maps/pixi/effects.js'

test('beam hit glow follows the laser opacity window', () => {
  const glow = { pulse: false, delayMs: 220, speed: 1 }
  assert.equal(shotHitGlowAlpha(glow, 0), 0)
  assert.equal(shotHitGlowAlpha(glow, 100), 0)
  // Mid-beam (after delay, in the hold plateau).
  const mid = shotHitGlowAlpha(glow, 220 + BEAM_SHOT_MS * 0.35)
  assert.ok(mid > 0.9, `expected strong mid-beam glow, got ${mid}`)
  // After the beam fades out.
  assert.equal(shotHitGlowAlpha(glow, 220 + BEAM_SHOT_MS + 1), 0)
})

test('pulse hit glow starts at bolt impact and holds through the wash', () => {
  const glow = { pulse: true, delayMs: 220, speed: 1 }
  assert.equal(shotHitGlowAlpha(glow, 220), 0)
  const impactStart = 220 + PULSE_IMPACT_AFTER_MS
  assert.ok(shotHitGlowAlpha(glow, impactStart + 50) > 0.8, 'expected strong glow just after impact')
  assert.ok(shotHitGlowAlpha(glow, impactStart + 280) > 0.8, 'expected held glow mid-wash')
  assert.equal(shotHitGlowAlpha(glow, impactStart + 560 + 1), 0)
})
