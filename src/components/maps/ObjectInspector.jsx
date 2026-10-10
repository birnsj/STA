// The map editor's panel for a challenge object (challenges.json) the user clicked: what it is and where it stands. Its
// actions and states stay in challenges.json; the map only says where the object goes (mapFormat.js objectPlacements).
// definition: where this map puts it; home: [x, y] from challenges.json. placing: the next board click moves it.
export default function ObjectInspector({ definition, home, placing, onPlace, onReset }) {
  const [x, y] = definition.position
  const moved = x !== home[0] || y !== home[1]
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
      <p className="me-text">Move on Map moves only the object. To take its tile art too (the junction&apos;s machinery), drag the tile with the toolbar&apos;s Move.</p>
      <p className="me-text">{placing ? 'Click a tile on the map to move it there (Escape cancels).' : moved ? `Moved from ${home[0]}, ${home[1]} (challenges.json).` : 'Where challenges.json puts it.'}</p>
      <button type="button" className="me-button" aria-pressed={placing} onClick={onPlace}>
        {placing ? 'Cancel' : 'Move on Map'}
      </button>
      {moved && (
        <button type="button" className="me-button" onClick={onReset}>
          Reset Position
        </button>
      )}
    </div>
  )
}
