import { isDefeated } from '../rules/personalCondition.js'

export const isUp = (actor) => Boolean(actor) && !isDefeated(actor.condition)
export const isDown = (actor) => !isUp(actor)
