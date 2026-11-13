// Weighted role choices for Generate Map styles (Generator Editor multi-slots).
// Entries are { id, weight } with weights in 0–1 that sum to 1 (relative mix).
// Legacy string / string[] values normalize to equal weights.

function clamp01(n) {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

function roundWeight(n) {
  return Math.round(clamp01(n) * 1000) / 1000
}

/** @returns {{ id: string, weight: number }[]} */
export function normalizeWeightedEntries(raw, { known = () => true, allowEmpty = false, fallback = null } = {}) {
  const pushUnique = (list, id, weight) => {
    if (!id || typeof id !== 'string' || !known(id)) return
    if (list.some((entry) => entry.id === id)) return
    list.push({ id, weight: weight == null ? 1 : clamp01(Number(weight)) })
  }

  const collected = []
  if (raw == null || raw === '') {
    /* empty */
  } else if (typeof raw === 'string') {
    pushUnique(collected, raw, 1)
  } else if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (typeof entry === 'string') pushUnique(collected, entry, 1)
      else if (entry && typeof entry === 'object' && typeof entry.id === 'string') {
        pushUnique(collected, entry.id, entry.weight)
      }
    }
  } else if (typeof raw === 'object' && typeof raw.id === 'string') {
    pushUnique(collected, raw.id, raw.weight)
  }

  if (!collected.length) {
    if (allowEmpty) return []
    if (fallback != null) return normalizeWeightedEntries(fallback, { known, allowEmpty: true })
    return []
  }

  const sum = collected.reduce((total, entry) => total + entry.weight, 0)
  if (sum <= 0) {
    const equal = roundWeight(1 / collected.length)
    return collected.map((entry, index) => ({
      id: entry.id,
      weight: index === collected.length - 1 ? roundWeight(1 - equal * (collected.length - 1)) : equal,
    }))
  }
  return collected.map((entry) => ({ id: entry.id, weight: roundWeight(entry.weight / sum) }))
}

export function weightedIds(entries) {
  return normalizeWeightedEntries(entries, { allowEmpty: true }).map((entry) => entry.id)
}

export function primaryId(entries) {
  return weightedIds(entries)[0] ?? null
}

export function weightedListsEqual(a, b) {
  const left = normalizeWeightedEntries(a, { allowEmpty: true })
  const right = normalizeWeightedEntries(b, { allowEmpty: true })
  if (left.length !== right.length) return false
  return left.every((entry, index) => entry.id === right[index].id && entry.weight === right[index].weight)
}

/** Equal rebalance after insert (designer: equal split on land). */
export function addWeightedEntry(entries, id) {
  if (!id) return normalizeWeightedEntries(entries, { allowEmpty: true })
  const current = normalizeWeightedEntries(entries, { allowEmpty: true })
  if (current.some((entry) => entry.id === id)) return current
  return normalizeWeightedEntries([...current.map((entry) => entry.id), id], { allowEmpty: true })
}

export function removeWeightedEntry(entries, id) {
  if (!id) return normalizeWeightedEntries(entries, { allowEmpty: true })
  return normalizeWeightedEntries(
    normalizeWeightedEntries(entries, { allowEmpty: true }).filter((entry) => entry.id !== id),
    { allowEmpty: true },
  )
}

/** Set one entry's share (0–1); renormalize the rest proportionally. */
export function setEntryWeight(entries, id, weight) {
  const current = normalizeWeightedEntries(entries, { allowEmpty: true })
  if (!current.length || !current.some((entry) => entry.id === id)) return current
  if (current.length === 1) return [{ id: current[0].id, weight: 1 }]

  const target = clamp01(Number(weight))
  const others = current.filter((entry) => entry.id !== id)
  const otherSum = others.reduce((total, entry) => total + entry.weight, 0)
  const remain = 1 - target
  let next
  if (otherSum <= 0) {
    const equal = remain / others.length
    next = current.map((entry) => (entry.id === id ? { id, weight: target } : { id: entry.id, weight: equal }))
  } else {
    next = current.map((entry) =>
      entry.id === id ? { id, weight: target } : { id: entry.id, weight: (entry.weight / otherSum) * remain },
    )
  }
  return normalizeWeightedEntries(next, { allowEmpty: true })
}

export function pickWeighted(entries, random = Math.random) {
  const list = normalizeWeightedEntries(entries, { allowEmpty: true })
  if (!list.length) return null
  if (list.length === 1) return list[0].id
  let roll = random()
  for (const entry of list) {
    roll -= entry.weight
    if (roll < 0) return entry.id
  }
  return list[list.length - 1].id
}

/** Accept string | weighted list; returns a fresh pick function bound to `random`. */
export function rolePicker(role, random = Math.random) {
  if (typeof role === 'string' && role) return () => role
  const list = normalizeWeightedEntries(role, { allowEmpty: true })
  if (!list.length) return () => null
  if (list.length === 1) return () => list[0].id
  return () => pickWeighted(list, random)
}

export function floorIdSet(role) {
  if (typeof role === 'string' && role) return new Set([role])
  return new Set(weightedIds(role))
}

export function serializeWeighted(entries, { allowEmpty = false } = {}) {
  const list = normalizeWeightedEntries(entries, { allowEmpty: true })
  if (!list.length) return allowEmpty ? [] : null
  return list.map((entry) => ({ id: entry.id, weight: entry.weight }))
}
