import AssetProperties from './AssetProperties.jsx'
import EditorInspectors from './EditorInspectors.jsx'
import { hasAssetSelection, hasBoardSelection } from './editorSelection.js'
import MapProperties from './MapProperties.jsx'
import { PropertySectionsProvider, PropertySectionsToolbar } from './PropertySections.jsx'

// Right Properties panel: Properties = board entity or Assets thumbnail; Map = episode / location props.

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
  layers = null,
}) {
  const boardSelected = hasBoardSelection(selection)
  const assetSelected = hasAssetSelection(tool)
  // Catalogue tile / Template Piece brush wins over a leftover board pick so Layer stays reachable.
  const showAssetProps = assetSelected && Boolean(tool?.startsWith('tile:') || tool?.startsWith('template:'))
  const canShowSelection = boardSelected || assetSelected
  const showMap = !canShowSelection || showMapTab
  // Remount sections when the tab or selection changes so collapse state resets cleanly.
  const sectionsKey = showMap
    ? 'map'
    : showAssetProps
      ? `asset:${tool ?? ''}`
      : boardSelected
        ? `board:${selection?.npc?.id ?? ''}:${selection?.object?.id ?? ''}:${selection?.destructible?.id ?? ''}:${selection?.hazard?.id ?? ''}:${selection?.groundItem?.id ?? ''}:${selection?.templatePiece?.id ?? ''}:${selection?.marker?.kind ?? ''}:${selection?.marker?.label ?? ''}`
        : `asset:${tool ?? ''}`

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
          Properties
        </button>
      </div>
      <PropertySectionsProvider key={sectionsKey}>
        <PropertySectionsToolbar />
        <div className="ed-properties-body">
          {showMap ? (
            <MapProperties {...mapProps} map={map} edit={edit} />
          ) : showAssetProps || !boardSelected ? (
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
          ) : (
            <EditorInspectors
              map={map}
              edit={edit}
              tool={tool}
              conversations={conversations}
              selection={selection}
              layers={layers}
              {...inspectors}
              onStatus={onStatus}
              animateTiles={animateTiles}
              ambient={map.ambient}
              ambientColour={map.ambientColour}
              onAmbient={mapProps?.onAmbient}
              onAmbientColour={mapProps?.onAmbientColour}
            />
          )}
        </div>
      </PropertySectionsProvider>
    </aside>
  )
}
