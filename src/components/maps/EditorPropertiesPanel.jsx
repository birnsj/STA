import AssetProperties from './AssetProperties.jsx'
import EditorInspectors from './EditorInspectors.jsx'
import { hasAssetSelection, hasBoardSelection } from './editorSelection.js'
import MapProperties from './MapProperties.jsx'

// Right Properties panel: Selection = board entity or Assets thumbnail; Map = episode / location props.

export default function EditorPropertiesPanel({
  map,
  edit,
  tool,
  conversations,
  selection,
  showMapTab,
  onShowMapTab,
  mapProps,
  inspectors,
  onStatus,
  hazardIntensity,
  onHazardIntensity,
  animateTiles = true,
}) {
  const boardSelected = hasBoardSelection(selection)
  const assetSelected = hasAssetSelection(tool)
  const canShowSelection = boardSelected || assetSelected
  const showMap = !canShowSelection || showMapTab

  return (
    <aside className="ed-properties me-side">
      <div className="ed-panel-head">Properties</div>
      <div className="ed-properties-tabs" role="tablist">
        <button type="button" role="tab" className={`ed-tab${showMap ? ' is-active' : ''}`} aria-selected={showMap} onClick={() => onShowMapTab(true)}>
          Map
        </button>
        <button
          type="button"
          role="tab"
          className={`ed-tab${!showMap ? ' is-active' : ''}`}
          aria-selected={!showMap}
          disabled={!canShowSelection}
          onClick={() => onShowMapTab(false)}
        >
          Selection
        </button>
      </div>
      <div className="ed-properties-body">
        {showMap ? (
          <MapProperties {...mapProps} map={map} edit={edit} />
        ) : boardSelected ? (
          <EditorInspectors map={map} edit={edit} tool={tool} conversations={conversations} selection={selection} {...inspectors} />
        ) : (
          <AssetProperties
            tool={tool}
            onStatus={onStatus}
            hazardIntensity={hazardIntensity}
            onHazardIntensity={onHazardIntensity}
            animateTiles={animateTiles}
            ambient={map.ambient}
            ambientColour={map.ambientColour}
            onAmbient={mapProps?.onAmbient}
            onAmbientColour={mapProps?.onAmbientColour}
          />
        )}
      </div>
    </aside>
  )
}
