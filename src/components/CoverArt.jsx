import { useStageSize } from './ScaledStage.jsx'

// How much of the art (in its own pixels) to crop from the start of one axis: centred where possible, but shifted
// so the safe span [safeStart, safeEnd] stays on screen. If the span cannot fit, it is centred instead.
function cropOffset(artSize, visible, safeStart, safeEnd) {
  const overflow = Math.max(artSize - visible, 0)
  let offset = overflow / 2
  if (safeEnd - safeStart > visible) offset = (safeStart + safeEnd - visible) / 2
  else offset = Math.min(Math.max(offset, safeEnd - visible), safeStart)
  return Math.min(Math.max(offset, 0), overflow)
}

// Scales artwork authored at a fixed size (plus anything positioned in its pixel coordinates) to cover the whole stage.
// safeArea ({ left, top, right, bottom } in art pixels) is the region that must never be cropped.
export default function CoverArt({ width, height, image, safeArea = { left: 0, top: 0, right: width, bottom: height }, children }) {
  const stage = useStageSize()
  const scale = Math.max(stage.width / width, stage.height / height)
  const x = cropOffset(width, stage.width / scale, safeArea.left, safeArea.right)
  const y = cropOffset(height, stage.height / scale, safeArea.top, safeArea.bottom)
  return (
    <div
      className="cover-art"
      style={{ width, height, transform: `scale(${scale}) translate(${-x}px, ${-y}px)`, backgroundImage: image ? `url(${image})` : undefined }}
    >
      {children}
    </div>
  )
}
