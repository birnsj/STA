// Plain-data controller policy for rules that only need to know whether a combatant waits for the player. Keeping this
// question independent of controller instances prevents combat rules from importing the actor-controller registry.
export const isPlayerControlledActor = (actor) => actor?.controllerId === 'player' || (!actor?.controllerId && actor?.side === 'player')
