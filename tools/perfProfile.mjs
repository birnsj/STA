// Dev-only: a V8 CPU profile of one gameplay scenario, summarised as the functions with the most self time.
//   node tools/perfProfile.mjs <explore-idle|explore-move> [seconds]
// Needs the dev server (127.0.0.1:5173). The scenario set-up lives in tools/perfScenarios.mjs.
import { launchBrowser } from './perfBrowser.mjs'
import { SCENARIOS } from './perfScenarios.mjs'

const name = process.argv[2] ?? 'explore-idle'
const seconds = Number(process.argv[3] ?? 10)
const scenario = SCENARIOS[name]
if (!scenario) throw new Error(`Unknown scenario ${name}`)

const b = await launchBrowser()
try {
  await scenario.setup(b)
  const drive = scenario.makeDrive ? scenario.makeDrive() : scenario.drive
  await drive(b, 3)
  await b.send('Profiler.enable')
  await b.send('Profiler.setSamplingInterval', { interval: 200 })
  await b.send('Profiler.start')
  await drive(b, seconds)
  const { profile } = await b.send('Profiler.stop')

  // Self time per node: each sample is attributed to the node it landed in, weighted by the gap to the next sample.
  const byId = new Map(profile.nodes.map((node) => [node.id, node]))
  const self = new Map()
  profile.samples.forEach((id, index) => {
    const delta = profile.timeDeltas[index] ?? 0
    self.set(id, (self.get(id) ?? 0) + delta)
  })
  const byFunction = new Map()
  for (const [id, micros] of self) {
    const { callFrame } = byId.get(id)
    const file = callFrame.url.replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, '')
    const key = `${callFrame.functionName || '(anonymous)'} ${file}:${callFrame.lineNumber + 1}`
    byFunction.set(key, (byFunction.get(key) ?? 0) + micros)
  }
  const total = [...byFunction.values()].reduce((sum, value) => sum + value, 0)
  const rows = [...byFunction.entries()].sort((a, b) => b[1] - a[1]).slice(0, 35)
  console.log(`${name}: ${seconds}s profile, ${(total / 1000).toFixed(0)} ms sampled`)
  for (const [key, micros] of rows) console.log(`${((micros / total) * 100).toFixed(1).padStart(5)}%  ${(micros / 1000).toFixed(0).padStart(6)} ms  ${key}`)
} finally {
  await b.close()
}
