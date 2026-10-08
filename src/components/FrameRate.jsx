import { useEffect, useState } from 'react'

// A frame longer than this shows as a visible stutter.
const HITCH_MS = 50
const REPORT_MS = 500

// Developer readout for a debug panel's <dl>: frames per second, the slowest frame in the last half second, and how
// many hitches there have been since the panel opened. It counts frames itself and re-renders only twice a second, so
// it adds next to nothing to what it measures.
export default function FrameRate() {
  const [report, setReport] = useState({ fps: null, worst: null, hitches: 0 })

  useEffect(() => {
    let frame
    let last = performance.now()
    let windowStart = last
    let frames = 0
    let worst = 0
    let hitches = 0
    const tick = (now) => {
      const gap = now - last
      last = now
      frames++
      worst = Math.max(worst, gap)
      if (gap > HITCH_MS) hitches++
      if (now - windowStart >= REPORT_MS) {
        setReport({ fps: Math.round((frames * 1000) / (now - windowStart)), worst: Math.round(worst), hitches })
        windowStart = now
        frames = 0
        worst = 0
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <>
      <dt>Frame rate</dt>
      <dd title={`Slowest frame in the last half second, and frames over ${HITCH_MS} ms since this panel opened`}>
        {report.fps ?? '-'} fps (slowest {report.worst ?? '-'} ms, {report.hitches} {report.hitches === 1 ? 'hitch' : 'hitches'})
      </dd>
    </>
  )
}
