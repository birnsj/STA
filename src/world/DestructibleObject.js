// A destructible object (docs/world-objects.md): an EPS conduit, gas cylinder, structural support... that can be shot,
// damaged and blown up. Like the other world objects it is behaviour only: the record lives in state.environment
// (world/environment.js) and every method returns new plain data. Not a character: it has no attributes, turns or
// Injuries, only a Structure track and Resistance.
import { damageObject, DESTRUCTIBLE_TYPES, isStanding, objectDamage } from './environment.js'
import { WorldObject } from './WorldObject.js'

export class DestructibleObject extends WorldObject {
  // definition: the environment record { id, type, name, position: { x, y }, structure, maxStructure, resistance, state }.
  position() {
    return { ...this.definition.position }
  }

  tiles() {
    return [this.position()]
  }

  runtime(environment) {
    return environment.destructibles[this.id]
  }

  typeInfo() {
    return DESTRUCTIBLE_TYPES[this.definition.type]
  }

  isStanding() {
    return isStanding(this.definition)
  }

  // The Structure a hit of this severity takes off.
  damageFrom(severity) {
    return objectDamage(this.definition, severity)
  }

  // A hit of this severity: damageObject's result (the environment, the map, who the blasts caught, the log lines).
  hit(environment, map, severity, actors) {
    return damageObject(environment, map, this.id, this.damageFrom(severity), actors)
  }

  view() {
    const { id, type, name, position, structure, maxStructure, resistance, state } = this.definition
    const info = this.typeInfo()
    return { id, type, name, position, structure, maxStructure, resistance, state, description: info.description, explosion: info.explosion }
  }
}

export const destructibleFor = (environment, id) => {
  const record = environment?.destructibles?.[id]
  return record ? new DestructibleObject(record) : null
}
