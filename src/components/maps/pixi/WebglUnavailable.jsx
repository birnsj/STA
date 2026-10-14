import '../maps.css'

// In place of a board whose Pixi scene couldn't start: the boards are drawn only with WebGL.
export default function WebglUnavailable() {
  return (
    <div className="webgl-unavailable" role="alert">
      <p>The map needs WebGL, which this browser could not start.</p>
      <p>Turn on hardware acceleration in the browser's settings, then reload the page.</p>
    </div>
  )
}
