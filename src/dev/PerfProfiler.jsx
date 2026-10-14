import { Profiler } from 'react'
import { PERF, perfCommit } from './perfProbe.js'

// React's own <Profiler> around a subtree, reporting commits and render time to the perf probe. A plain pass-through
// (no Profiler, no cost) unless the probe is on (?perf=1 in `vite dev`).
export default function PerfProfiler({ id, children }) {
  if (!PERF) return children
  return (
    <Profiler id={id} onRender={(name, phase, actualDuration) => perfCommit(name, phase, actualDuration)}>
      {children}
    </Profiler>
  )
}
