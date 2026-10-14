// Dev-only: prints the median-of-runs table for tmp-check/perf-*.json files written by tools/perfRun.mjs.
//   node tools/perfSummary.mjs [file-prefix-filter] [--detail]
import { readdirSync, readFileSync } from 'node:fs'

const filter = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : ''
const detail = process.argv.includes('--detail')

const median = (values) => {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b)
  if (!sorted.length) return null
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}
const spread = (values) => {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b)
  return sorted.length ? sorted[sorted.length - 1] - sorted[0] : null
}
const round = (value) => (value == null ? '-' : Math.round(value * 1000) / 1000)

const files = readdirSync('tmp-check')
  .filter((name) => name.startsWith('perf-') && name.endsWith('.json') && name.includes(filter))
  .sort()

for (const file of files) {
  const { reports } = JSON.parse(readFileSync(`tmp-check/${file}`, 'utf8'))
  const pick = (read) => reports.map((report) => read(report))
  const row = (label, read, unit = '') => `${label} ${round(median(pick(read)))}${unit} (±${round(spread(pick(read)))})`
  console.log(`\n${file.replace(/^perf-|\.json$/g, '')}  [${reports.length} runs, median (range)]`)
  console.log(
    '  ' +
      [
        row('fps', (r) => r.frames.fps),
        row('mean', (r) => r.frames.meanMs, 'ms'),
        row('p95', (r) => r.frames.p95Ms, 'ms'),
        row('p99', (r) => r.frames.p99Ms, 'ms'),
        row('>33ms', (r) => r.frames.over33ms),
        row('gc/min', (r) => r.memory.collectionsPerMinute),
      ].join('  '),
  )
  if (reports[0].browser) {
    console.log(
      '  main thread: ' +
        [
          row('busy', (r) => r.browser.mainThreadBusyPct, '%'),
          row('script', (r) => r.browser.scriptPct, '%'),
          row('layout', (r) => r.browser.layoutPct, '%'),
          row('style', (r) => r.browser.styleRecalcPct, '%'),
          row('layouts/s', (r) => r.browser.layoutsPerSec),
          row('styles/s', (r) => r.browser.styleRecalcsPerSec),
        ].join('  '),
    )
  }
  if (!detail) continue
  const names = (kind) => [...new Set(reports.flatMap((report) => Object.keys(report[kind])))].sort()
  for (const name of names('timers')) console.log(`  timer ${name}: ${round(median(pick((r) => r.timers[name]?.perFrameMs)))} ms/frame, mean call ${round(median(pick((r) => r.timers[name]?.meanMs)))} ms, p95 ${round(median(pick((r) => r.timers[name]?.p95Ms)))} ms`)
  for (const name of names('counters')) console.log(`  count ${name}: ${round(median(pick((r) => r.counters[name]?.perFrame)))} /frame`)
  for (const name of names('profilers')) console.log(`  react ${name}: ${round(median(pick((r) => r.profilers[name]?.commitsPerSecond)))} commits/s, mean ${round(median(pick((r) => r.profilers[name]?.meanMs)))} ms`)
}
