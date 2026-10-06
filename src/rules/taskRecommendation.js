// Which party members are the strongest choice for one task. Presentation only: a recommendation, never a restriction.
//
// Each candidate is judged on the same prepared task the roll would use (taskPreparation.js: their own Attribute +
// Department, applicable focus and critical range, structured effects, Fatigue's automatic failure, the final
// Difficulty, blocking requirements), through the shared resolver's own odds (taskResolver.js staTaskChance) on the base
// 2d20. Nothing here re-derives a stat: a higher Department alone never makes anyone "best".
// Not counted (the odds don't model them): complication range, ignored complications and bonus Momentum.
import { staTaskChance, TASK_DICE } from './taskResolver.js'

// Chances closer than half a percent are a tie: the task panel rounds chances to whole percent, and neither character
// is mechanically better in any way the player could see.
const TIE_MARGIN = 0.005

// candidates: [{ id, prepared }] (prepared from prepareTask, or null when there is no roll).
// Returns { bestIds, entries: { [id]: { chance, possible, targetNumber, focus, difficulty, autoFail } }, allTied }.
// bestIds is empty when nobody can succeed, or when every candidate is equally suited (allTied).
export function recommendPerformers(candidates) {
  const entries = Object.fromEntries(
    candidates.map(({ id, prepared }) => {
      const possible = Boolean(prepared?.possible)
      return [
        id,
        {
          chance: possible ? staTaskChance({ task: prepared.task, difficulty: prepared.difficulty, dice: TASK_DICE }) : 0,
          possible,
          targetNumber: prepared?.task.targetNumber ?? null,
          focus: prepared?.focus ?? null,
          difficulty: prepared?.difficulty ?? null,
          autoFail: Boolean(prepared?.task.autoFail),
        },
      ]
    }),
  )
  const scored = Object.entries(entries).filter(([, entry]) => entry.possible && entry.chance > 0)
  if (!scored.length) return { bestIds: [], entries, allTied: false }
  const top = Math.max(...scored.map(([, entry]) => entry.chance))
  const bestIds = scored.filter(([, entry]) => top - entry.chance < TIE_MARGIN).map(([id]) => id)
  const allTied = candidates.length > 1 && bestIds.length === candidates.length
  return { bestIds: allTied ? [] : bestIds, entries, allTied }
}
