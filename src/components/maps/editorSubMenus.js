// File menus for Map Editor full-screen Tools editors (Animation Viewer pattern).
// Save / Load act on that editor's data — not the open map — unless the screen is map-embedded.

export function subEditorFileMenus({
  newItem = false,
  load = true,
  save = true,
  revert = false,
  deleteItem = false,
  newLabel = 'New',
  loadLabel = 'Load…',
  saveLabel = 'Save',
  revertLabel = 'Revert',
  deleteLabel = 'Delete',
  backLabel = 'Back to Map',
  extraFileItems = [],
} = {}) {
  const items = []
  if (newItem) items.push({ id: 'new', label: newLabel })
  if (load) items.push({ id: 'load', label: loadLabel })
  if (save) items.push({ id: 'save', label: saveLabel })
  if (revert) items.push({ id: 'revert', label: revertLabel })
  if (deleteItem) items.push({ id: 'delete', label: deleteLabel })
  for (const entry of extraFileItems) items.push(entry)
  if (items.length) items.push({ sep: true })
  items.push({ id: 'back', label: backLabel })
  return [{ id: 'file', label: 'File', items }]
}

/** Objectives / Objects: data lives on the open map. */
export function mapEmbeddedEditorMenus() {
  return subEditorFileMenus({
    load: true,
    save: true,
    loadLabel: 'Load Map…',
    saveLabel: 'Save Map',
    extraFileItems: [{ id: 'saveAs', label: 'Save Map As…' }],
  })
}
