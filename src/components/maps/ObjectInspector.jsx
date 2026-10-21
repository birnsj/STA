// The map editor's panel for a selected challenge object: placement, covers, and a link into the Object Editor.
// definition: where this map puts it (after placements). home: [x, y] before objectPlacements. mapOwned: defs live on map.objects.
export default function ObjectInspector({ definition, home, mapOwned, placing, editingCovers, onPlace, onEditCovers, onReset, onOpenEditor }) {
  const [x, y] = definition.position
  const moved = x !== home[0] || y !== home[1]
  const ownership = mapOwned
    ? 'Part of this map (Object Editor). Save the map to keep changes.'
    : 'From challenges.json until you edit defs or covers; then they are saved with the map.'
  return (
    <div className="me-inspector">
      <p className="me-heading">
        Challenge Object · {x}, {y}
      </p>
      <p className="me-text">
        <strong>{definition.name}</strong> ({definition.id}, {definition.type})
      </p>
      <p className="me-text">
        Starts {definition.states[definition.state]?.label ?? definition.state}. Actions: {definition.actions.map((action) => action.label).join(', ') || 'none'}.
      </p>
      {definition.covers?.length > 0 && <p className="me-text">Also covers {definition.covers.map(([cx, cy]) => `${cx}, ${cy}`).join('; ')} (the rest of the doorway); they move with it.</p>}
      <p className="me-text">{ownership}</p>
      <p className="me-text">Move on Map moves only the object. To take its tile art too (the junction&apos;s machinery), drag the tile with the toolbar&apos;s Move.</p>
      <p className="me-text">
        {editingCovers
          ? 'Click tiles to add or remove covers (Escape cancels). The object tile itself cannot be a cover.'
          : placing
            ? 'Click a tile on the map to move it there (Escape cancels).'
            : moved
              ? `Moved from ${home[0]}, ${home[1]}${mapOwned ? '.' : ' (challenges.json).'}`
              : mapOwned
                ? 'Where the map definition puts it.'
                : 'Where challenges.json puts it.'}
      </p>
      <button type="button" className="me-button" aria-pressed={placing} onClick={onPlace} disabled={editingCovers}>
        {placing ? 'Cancel' : 'Move on Map'}
      </button>
      <button type="button" className="me-button" aria-pressed={editingCovers} onClick={onEditCovers} disabled={placing}>
        {editingCovers ? 'Done Covers' : 'Edit Covers'}
      </button>
      {moved && !mapOwned && (
        <button type="button" className="me-button" onClick={onReset}>
          Reset Position
        </button>
      )}
      <button type="button" className="me-button me-generate" onClick={onOpenEditor}>
        Edit in Object Editor
      </button>
    </div>
  )
}
