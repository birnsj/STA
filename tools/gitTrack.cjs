const { execFileSync } = require('child_process')
const path = require('path')

// Stage catalogue / art paths after Dev Edit authoring so deletes and imports show in git status.
// Soft-fail when git is missing or paths are outside the repo (no throw into the editor save path).

function repoRootFromPublic(publicRoot) {
  if (!publicRoot) return null
  return path.resolve(publicRoot, '..')
}

function toRepoRelative(repoRoot, absolutePath) {
  if (!absolutePath) return null
  const root = path.resolve(repoRoot)
  const resolved = path.resolve(absolutePath)
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`
  if (resolved !== root && !resolved.startsWith(prefix)) return null
  return path.relative(root, resolved).split(path.sep).join('/')
}

function stageRepoPaths(repoRoot, absolutePaths) {
  if (!repoRoot) return { staged: [] }
  const rel = [...new Set((absolutePaths ?? []).map((entry) => toRepoRelative(repoRoot, entry)).filter(Boolean))]
  if (!rel.length) return { staged: [] }
  try {
    execFileSync('git', ['add', '-A', '--', ...rel], { cwd: repoRoot, stdio: 'pipe' })
    return { staged: rel }
  } catch (error) {
    return { staged: [], error: error?.message ?? String(error) }
  }
}

function stageArtHrefs(publicRoot, hrefs) {
  const root = repoRootFromPublic(publicRoot)
  if (!root || !publicRoot) return { staged: [] }
  const absolute = (hrefs ?? [])
    .map((href) => {
      if (typeof href !== 'string' || !href.startsWith('/art/')) return null
      const relative = decodeURIComponent(href.slice('/art/'.length))
      if (!relative || relative.includes('\0')) return null
      return path.resolve(publicRoot, 'art', ...relative.split(/[/\\]+/).filter(Boolean))
    })
    .filter(Boolean)
  return stageRepoPaths(root, absolute)
}

/** Stage catalogue JSON + deleted/imported art after Dev Edit authoring. */
function trackAuthoringChange(publicRoot, { files = [], artHrefs = [] } = {}) {
  const root = repoRootFromPublic(publicRoot)
  const catalogue = stageRepoPaths(root, files)
  const art = stageArtHrefs(publicRoot, artHrefs)
  return {
    staged: [...new Set([...(catalogue.staged ?? []), ...(art.staged ?? [])])],
    error: catalogue.error || art.error || null,
  }
}

module.exports = { repoRootFromPublic, stageRepoPaths, stageArtHrefs, trackAuthoringChange, toRepoRelative }
