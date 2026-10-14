import { Container, Graphics, GraphicsPath } from 'pixi.js'
import { FigureView } from '../../maps/pixi/figures.js'
import { dashedEllipse, makeLabel, placeLabel } from '../../maps/pixi/pixiDraw.js'
import { reducedMotion } from '../../maps/pixi/pixiStage.js'
import { advancePose, initialPose, poseInput, settlePose, shownPose } from '../unitPose.js'
import { LABEL_Y, POINTS_Y } from '../battlefieldShared.js'

// A combatant on the Pixi combat board: the shared figure (figures.js FigureView: ring,
// sprite or portrait token, facing arrow, beams) with combat's pieces: the selected ring, the cover shield, the
// Surrendered / Retreating label, the guard badge, the Stress bar and Injuries, the action points or the done icon,
// and the target brackets. Its pose (strike, fall, getting up, hands up) follows unitPose.js
// from the timestamps of each frame. Presentation only.

const YELLOW = 0xf6b928
const RED = 0xe2463d
const GREEN = 0x3ccf7a
const GREY = 0x6b7486
const COVER_POP_MS = 350
const SHIELD = new GraphicsPath('M0 -7 L6 -4.5 V0.5 C6 4 3.5 6.2 0 7.5 C-3.5 6.2 -6 4 -6 0.5 V-4.5 Z')

function coverBadge() {
  const badge = new Container()
  const shield = new Graphics().path(SHIELD).fill({ color: 0x2f8fd8 }).stroke({ color: 0xd8f0ff, width: 1.2, join: 'round' })
  const mark = new Graphics().moveTo(-2.6, 0.2).lineTo(-0.6, 2.2).lineTo(2.8, -1.8).stroke({ color: 0xffffff, width: 1.6, cap: 'round' })
  badge.addChild(shield, mark)
  return badge
}

function guardBadge() {
  const badge = new Container()
  badge.addChild(new Graphics().roundRect(-6.5, -6.5, 13, 13, 2).fill({ color: 0xd8a32f }).stroke({ color: 0xfff4d8, width: 1.2 }))
  const letter = makeLabel('G', { size: 9, weight: '800', fill: 0x1a1204, outline: false })
  placeLabel(letter, 0, 3.5)
  badge.addChild(letter)
  return badge
}

// ConditionTrack svg: what is left of the Stress (full when unhurt), and a mark per Injury.
function conditionTrack({ maxStress, stress, fatigued, injuries }) {
  const width = 30
  const track = new Graphics()
  if (maxStress > 0) {
    track.roundRect(-width / 2, -2.5, width, 5, 2).fill({ color: 0x0b1428 }).stroke({ color: 0xe8ecf5, width: 1 })
    const filled = Math.max(0, 1 - stress / maxStress) * width
    if (filled > 0) track.roundRect(-width / 2, -2.5, filled, 5, Math.min(2, filled / 2)).fill({ color: fatigued ? 0xe08a3a : 0x7fb2ff })
  }
  injuries.forEach((injury, index) => {
    track.roundRect(width / 2 + 3 + index * 7, -3.5, 6, 7, 1).fill({ color: injury.type === 'stun' ? YELLOW : injury.type === 'deadly' ? RED : 0x000000 })
    if (injury.treated) track.stroke({ color: 0xe8ecf5, width: 1.2 })
  })
  return track
}

// The turn's actions left (Major, Minor), movement left and the unused Sprint, or the done icon.
function turnBadge(status) {
  const badge = new Container()
  if (status.state === 'done') {
    badge.addChild(
      new Graphics().circle(0, 0, 6.5).fill({ color: 0x4a5468 }).stroke({ color: 0xc9d1e0, width: 1 }),
      new Graphics().moveTo(-3, 0.2).lineTo(-0.8, 2.5).lineTo(3.2, -2.2).stroke({ color: 0xffffff, width: 1.8, cap: 'round', join: 'round' }),
    )
    return badge
  }
  const { turn, movement } = status
  const point = (x, left) =>
    left > 0 ? new Graphics().roundRect(x, -3.5, 6, 5, 1.5).fill({ color: GREEN }) : new Graphics().roundRect(x, -3.5, 6, 5, 1.5).fill({ color: 0x2b3242 }).stroke({ color: GREY, width: 0.6 })
  const text = (value, x, colour = GREEN) => {
    const label = makeLabel(value, { size: 9, weight: '700', fill: colour, outline: false })
    placeLabel(label, x, 2.5)
    return label
  }
  badge.addChild(
    new Graphics().roundRect(-34, -7, movement.sprintLeft ? 82 : 68, 12, 3).fill({ color: 0x060c1c, alpha: 0.9 }).stroke({ color: GREEN, width: 0.8 }),
    text('M', -28),
    point(-23, turn.major),
    text('m', -11),
    point(-6, turn.minor),
    new Graphics().moveTo(3.5, -5).lineTo(3.5, 3).stroke({ color: GREEN, width: 0.6, alpha: 0.5 }),
    text(`\u00bb${movement.left}/${movement.total}`, 18.5, movement.left ? 0x7fd3ff : GREY),
  )
  if (movement.sprintLeft > 0) badge.addChild(text(`+${movement.sprintLeft}`, 40, 0x7fd3ff))
  return badge
}

const bracket = () =>
  new Graphics()
    .moveTo(-22, -40).lineTo(-22, -54).lineTo(-14, -54)
    .moveTo(22, -40).lineTo(22, -54).lineTo(14, -54)
    .moveTo(-22, -2).lineTo(-22, 6).lineTo(-14, 6)
    .moveTo(22, -2).lineTo(22, 6).lineTo(14, 6)
    .stroke({ color: RED, width: 2 })

// unit: the figure description (FigureView) plus { combatant, poseOptions: { lastAction, hitDelayMs, speed },
// isWalking, msPerTile, selected, cover, statusLabel, guard, stressTrack: { maxStress, stress, fatigued, injuries } | null,
// conditionY, turnStatus, target }.
export class UnitView {
  constructor(sheets) {
    this.figure = new FigureView(sheets)
    this.container = this.figure.container
    this.selected = new Graphics()
    dashedEllipse(this.selected, 0, 0, 25, 12.5, 4, 3, { color: 0xffffff, alpha: 0.6, width: 1 })
    this.figure.under.addChild(this.selected)
    this.track = null
    this.cover = null
    this.coverFrom = 0
    this.badges = new Container()
    this.figure.over.addChild(this.badges)
    this.look = null
  }

  // unit is a new object only when the board re-renders, so the pose's input and the badges are looked at then; the
  // clocks (pose, walk, cover pop) run every frame.
  update(unit, now, revealed) {
    const changed = unit !== this.unit
    if (changed) {
      this.unit = unit
      this.shown = { ...unit }
      const input = poseInput(unit.combatant, unit.poseOptions)
      this.track = this.track ? advancePose(this.track, input, now) : initialPose(input)
      this.updateBadges(unit)
      this.selected.visible = unit.selected
    }
    const track = settlePose(this.track, now)
    if (changed || track !== this.track || !this.shown.pose) {
      this.track = track
      this.shown.pose = shownPose(track, { inCover: unit.combatant.inCover, isWalking: unit.isWalking })
    }
    this.shown.centre = this.walkedCentre(unit, now)
    this.figure.update(this.shown, now, revealed)
    this.updateCover(unit.cover, now)
  }

  // Where the figure stands now: gliding to a new tile in a straight line over msPerTile, as the board steps it along its path a tile at a time.
  walkedCentre(unit, now) {
    const to = unit.centre
    const walk = this.walk
    if (!walk) this.walk = { from: to, to, startedAt: now, ms: 0 }
    else if (walk.to.x !== to.x || walk.to.y !== to.y) this.walk = { from: this.centreAt(now), to, startedAt: now, ms: unit.msPerTile }
    return this.centreAt(now)
  }

  centreAt(now) {
    const { from, to, startedAt, ms } = this.walk
    const t = ms > 0 ? Math.min(1, (now - startedAt) / ms) : 1
    return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }
  }

  // The shield grows in from a fifth of its size over 0.35 s, eased out.
  updateCover(shown, now) {
    if (!shown) {
      this.cover?.destroy({ children: true })
      this.cover = null
      return
    }
    if (!this.cover) {
      this.cover = coverBadge()
      this.cover.position.set(16, -48)
      this.figure.over.addChildAt(this.cover, 0)
      this.coverFrom = now
    }
    const t = reducedMotion() ? 1 : Math.min(1, (now - this.coverFrom) / COVER_POP_MS)
    this.cover.scale.set(0.2 + 0.8 * (1 - (1 - t) * (1 - t)))
  }

  updateBadges(unit) {
    const { statusLabel, guard, stressTrack: condition, conditionY, turnStatus, target } = unit
    const look = JSON.stringify([statusLabel, guard, condition, conditionY, turnStatus, target])
    if (this.look === look) return
    this.look = look
    this.badges.removeChildren().forEach((child) => child.destroy({ children: true }))
    if (statusLabel) {
      const label = makeLabel(statusLabel, { size: 10, weight: '700', fill: 0xf2e6c4, outline: 0x000000 })
      placeLabel(label, 0, LABEL_Y)
      this.badges.addChild(label)
    }
    if (guard) {
      const badge = guardBadge()
      badge.position.set(-16, -48)
      this.badges.addChild(badge)
    }
    if (condition) {
      const track = conditionTrack(condition)
      track.position.set(0, conditionY)
      this.badges.addChild(track)
    }
    if (turnStatus) {
      const badge = turnBadge(turnStatus)
      badge.position.set(0, POINTS_Y)
      this.badges.addChild(badge)
    }
    if (target) this.badges.addChild(bracket())
  }

  destroy() {
    this.figure.destroy()
  }
}
