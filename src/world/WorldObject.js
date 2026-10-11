// A thing placed in the world (docs/world-objects.md). Behaviour only: the authored definition (challenges.json, placed
// by the map's objectPlacements) and the runtime record in scenario.objects stay plain data; methods read them and
// return new state, so saves, maps and React state hold no instances.
export class WorldObject {
  constructor(definition) {
    this.definition = definition
  }

  get id() {
    return this.definition.id
  }

  position() {
    return { x: this.definition.position[0], y: this.definition.position[1] }
  }

  // The tiles a state's tile replaces: the object's own, plus covers [[x, y]] (the rest of a two-tile doorway).
  tiles() {
    return [this.definition.position, ...(this.definition.covers ?? [])].map(([x, y]) => ({ x, y }))
  }

  runtime(scenario) {
    return scenario.objects[this.id]
  }

  distanceTo(point) {
    return Math.hypot(point.x - this.definition.position[0], point.y - this.definition.position[1])
  }

  // { id, name, type, position, state, stateLabel, description, changed } for drawing and listing.
  view(scenario) {
    const object = this.runtime(scenario)
    const info = this.definition.states[object.state] ?? {}
    return {
      id: this.id,
      name: this.definition.name,
      type: this.definition.type,
      position: this.position(),
      state: object.state,
      stateLabel: info.label ?? object.state,
      description: info.description ?? '',
      changed: object.state !== this.definition.state,
    }
  }
}
