// Dev Auto-Paint Ruleset Editor: saves rulesets into autoPaintRulesets.json via /__autopaint.
import { requestJson } from '../files/jsonHttp.js'
import {
  listAutoPaintRulesets,
  putAutoPaintRulesetLocal,
  removeAutoPaintRulesetLocal,
  replaceAutoPaintRulesetsLocal,
} from './autoPaint/rulesets.js'

export const canEditAutoPaintRulesets = import.meta.env.DEV

export async function saveAutoPaintRuleset(ruleset) {
  const next = putAutoPaintRulesetLocal(ruleset)
  if (!canEditAutoPaintRulesets) return next
  const result = await requestJson('/__autopaint', 'PUT', { op: 'put', ruleset: next })
  return putAutoPaintRulesetLocal(result)
}

export async function deleteAutoPaintRuleset(id) {
  const result = removeAutoPaintRulesetLocal(id)
  if (!canEditAutoPaintRulesets) return result
  await requestJson('/__autopaint', 'PUT', { op: 'delete', id })
  return result
}

export async function reloadAutoPaintRulesetsFromDisk() {
  if (!canEditAutoPaintRulesets) return listAutoPaintRulesets()
  const result = await requestJson('/__autopaint', 'PUT', { op: 'list' })
  return replaceAutoPaintRulesetsLocal(result?.rulesets ?? [])
}

export { listAutoPaintRulesets, putAutoPaintRulesetLocal }
