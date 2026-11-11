const fs = require('fs')
const path = require('path')

// Collect /art/... hrefs from nested JSON and delete orphaned PNGs under public/.

function collectArtHrefs(value, out = new Set()) {
  if (typeof value === 'string') {
    const href = value.split('?')[0]
    if (href.startsWith('/art/')) out.add(href)
    return out
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectArtHrefs(entry, out)
    return out
  }
  if (value && typeof value === 'object') {
    for (const entry of Object.values(value)) collectArtHrefs(entry, out)
  }
  return out
}

function resolvePublicArt(publicRoot, href) {
  if (typeof href !== 'string' || !href.startsWith('/art/')) return null
  const relative = decodeURIComponent(href.slice('/art/'.length))
  if (!relative || relative.includes('\0') || path.isAbsolute(relative)) return null
  const parts = relative.split(/[/\\]+/).filter(Boolean)
  if (!parts.length || parts.some((part) => part === '.' || part === '..')) return null
  if (!parts[parts.length - 1].toLowerCase().endsWith('.png')) return null
  const absolute = path.resolve(publicRoot, 'art', ...parts)
  const rootResolved = path.resolve(publicRoot, 'art')
  const prefix = rootResolved.endsWith(path.sep) ? rootResolved : `${rootResolved}${path.sep}`
  if (absolute !== rootResolved && !absolute.startsWith(prefix)) return null
  return absolute
}

function deleteOrphanArtFiles(publicRoot, candidates, stillUsed) {
  const removed = []
  for (const href of candidates) {
    if (stillUsed.has(href)) continue
    const absolute = resolvePublicArt(publicRoot, href)
    if (!absolute || !fs.existsSync(absolute)) continue
    fs.rmSync(absolute, { force: true })
    removed.push(href)
  }
  return removed
}

module.exports = { collectArtHrefs, resolvePublicArt, deleteOrphanArtFiles }
