// Node's ESM loader demands `with { type: 'json' }` on a JSON import; Vite does not, so the source imports its data
// files plainly. The tests register this hook (node --import) to load .json as an ordinary module instead.
import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { fileURLToPath } from 'node:url'

registerHooks({
  resolve(specifier, context, nextResolve) {
    const resolved = nextResolve(specifier, context)
    // Drop the attribute requirement: the load hook below hands back a plain module.
    if (resolved.url.endsWith('.json')) return { ...resolved, format: 'module', importAttributes: {} }
    return resolved
  },
  load(url, context, nextLoad) {
    if (url.startsWith('file:') && url.endsWith('.json')) {
      return { format: 'module', shortCircuit: true, source: `export default ${readFileSync(fileURLToPath(url), 'utf8')}` }
    }
    return nextLoad(url, context)
  },
})
