/**
 * CharacterBody — swappable figure draw/anim for SpikeActor.
 *
 * Implementations: ProceduralBody (now), MixamoBody (later). Boards and SpikeActor
 * must not import HumanoidModel / GLTF loaders directly.
 *
 * Contract (pose clip names from characterSprites.json / unitPose.js):
 *   idle, walk, run, sneakIdle, sneakWalk, fidgets, attack, melee, cover,
 *   punch, kick, dodge, getHit, falls, getUp, surrender, hazardPanic
 *
 * Required surface:
 *   play(clip, opts?)
 *   update(dt, travel)
 *   root                 THREE.Object3D parented under SpikeActor.root
 *   setUniform(colour)
 *   setAppearance({ gender, hairStyle, species, … })
 *   dispose()
 *
 * Optional for ragdoll hand-off (ProceduralBody):
 *   model                underlying HumanoidModel (materials / activate)
 *   materials            { robe, robeDk, skin, hood, boots }
 *   bodyY                bounce offset for contact shadow squash
 */

export const CHARACTER_BODY_CLIPS = [
  'idle',
  'walk',
  'run',
  'sneakIdle',
  'sneakWalk',
  'idleLookAround',
  'idleShiftWeight',
  'idleTurn',
  'idleCheckPhaser',
  'idleScratchHead',
  'attack',
  'melee',
  'cover',
  'punch',
  'kick',
  'dodge',
  'getHit',
  'fallCrumple',
  'fallBack',
  'fallForward',
  'fallSpin',
  'fallBlastBack',
  'fallBlastSpin',
  'fallBlastFlat',
  'getUp',
  'surrender',
  'hazardPanic',
]
