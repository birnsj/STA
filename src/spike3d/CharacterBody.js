/**
 * CharacterBody — swappable figure draw/anim for SpikeActor.
 *
 * Implementations: ProceduralBody (now), MixamoBody (later). Boards and SpikeActor
 * must not import HumanoidModel / GLTF loaders directly.
 *
 * Contract (pose clip names from characterSprites.json / unitPose.js):
 *   idle, walk, run, sneakIdle, sneakWalk, fidgets, attack, melee, cover,
 *   punch, kick, dodge, getHit, falls, getUp, surrender, hazardPanic,
 *   hazardPanicWalk, hazardPanicRun
 *
 * Required surface:
 *   play(clip, opts?)
 *   update(dt, travel)
 *   root                 THREE.Object3D parented under SpikeActor.root
 *   setUniform(colour)
 *   setAppearance({ gender, hairStyle, species, … })
 *   dispose()
 *
 * Optional for ragdoll / death hand-off (ProceduralBody):
 *   model                underlying HumanoidModel (materials / activate)
 *   materials            { robe, robeDk, skin, hood, boots }
 *   bodyY                bounce offset for contact shadow squash
 *   applyDeathRest(clip) prone rest after ragdoll settles
 *
 * Optional for Animation Viewer (ProceduralBody):
 *   setPaused(boolean)
 *   setViewerHoldOnce(boolean)
 *   setViewerLoopOnce(boolean)
 *   seek(u)              scrub playhead 0–1 and snap pose
 *   progress             current playhead 0–1
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
  'hazardPanicWalk',
  'hazardPanicRun',
]
