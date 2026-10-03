// Presentation timing shared by the Combat Type 2 board and screen (walk speed, and how long one enemy step takes to play).
export const STEP_MS = 110
const ATTACK_MS = 900
const OTHER_MS = 500

export const stepDuration = (events) =>
  events.reduce((ms, event) => ms + (event.type === 'move' ? (event.path.length - 1) * STEP_MS : event.type === 'roll' ? ATTACK_MS : OTHER_MS), 0)
