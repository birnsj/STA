// Dev-only benchmark runner for the performance audit (docs/performance.md). Needs the dev server on 127.0.0.1:5173
// (`npm run dev -- --port 5173 --strictPort --host 127.0.0.1`) because the probe is compiled out of production builds.
//
//   node tools/perfRun.mjs <scenario|all> [--runs 3] [--warmup 5] [--sample 15] [--off filters,weather] [--tag name]
//
// Protocol: fixed 1280x720 viewport at DPR 1, zoom as loaded, the 4-member party, fresh browser profile per run.
// Each run writes the probe report (src/dev/perfProbe.js) to tmp-check/perf-<scenario>[-<tag>].json.
import { mkdirSync, writeFileSync } from 'node:fs'
import { launchBrowser, sleep } from './perfBrowser.mjs'
import { SCENARIOS, flag, off, viewBoxOf } from './perfScenarios.mjs'

const scenarioArg = process.argv[2] ?? 'all'
const runs = Number(flag('runs', 3))
const warmup = Number(flag('warmup', 5))
const sample = Number(flag('sample', 15))
const METRICS_SECONDS = 8
const tag = flag('tag', off ? `off-${off.replaceAll(',', '+')}` : '')

// Main-thread time the in-page timers can't see: style recalculation, layout, and everything else in a task (paint
// included). Raster and GPU work run off the main thread and are not part of this.
async function browserMetrics(b) {
  const { metrics } = await b.send('Performance.getMetrics')
  return Object.fromEntries(metrics.map((metric) => [metric.name, metric.value]))
}
function metricsDelta(before, after) {
  const delta = (name) => (after[name] ?? 0) - (before[name] ?? 0)
  const seconds = delta('Timestamp')
  const pct = (name) => Math.round((delta(name) / seconds) * 1000) / 10
  return {
    seconds: Math.round(seconds * 100) / 100,
    mainThreadBusyPct: pct('TaskDuration'),
    scriptPct: pct('ScriptDuration'),
    layoutPct: pct('LayoutDuration'),
    styleRecalcPct: pct('RecalcStyleDuration'),
    layoutsPerSec: Math.round(delta('LayoutCount') / seconds),
    styleRecalcsPerSec: Math.round(delta('RecalcStyleCount') / seconds),
    nodesDelta: delta('Nodes'),
  }
}

function summarise(report) {
  const timer = (name) => report.timers[name]?.perFrameMs ?? 0
  return `fps ${report.frames.fps} mean ${report.frames.meanMs}ms p95 ${report.frames.p95Ms}ms >33ms:${report.frames.over33ms} gc/min ${report.memory.collectionsPerMinute} busy ${report.browser.mainThreadBusyPct}% script ${report.browser.scriptPct}% layout ${report.browser.layoutPct}% style ${report.browser.styleRecalcPct}% | frame ${timer('world.frame')} tick ${timer('sim.tickTotal')} pixi ${timer('pixi.frame')} board.render ${timer('board.wallFade')}+${timer('board.figureWindows')} draw ${timer('canvas.drawBoard')} dark ${timer('canvas.drawDarkness')} anim ${timer('anim.poll')}+${timer('anim.redraw')}`
}

async function runOnce(name, runIndex) {
  const scenario = SCENARIOS[name]
  const b = await launchBrowser()
  try {
    await scenario.setup(b)
    const drive = scenario.makeDrive ? scenario.makeDrive() : scenario.drive
    const before = await viewBoxOf(b)
    await b.evaluate('window.__perf.reset()')
    await drive(b, warmup)
    await b.evaluate('window.__perf.reset()')
    await drive(b, sample)
    const report = await b.evaluate('window.__perf.report()')
    // A separate window with the DevTools Performance domain on: it costs about 15% fps, so it must not overlap the
    // fps sample above.
    await b.send('Performance.enable')
    const metricsBefore = await browserMetrics(b)
    await drive(b, METRICS_SECONDS)
    report.browser = metricsDelta(metricsBefore, await browserMetrics(b))
    await b.send('Performance.disable')
    report.scenario = name
    report.run = runIndex
    report.viewBoxMoved = before !== (await viewBoxOf(b))
    await b.screenshot(`tmp-check/perf-${name}${tag ? `-${tag}` : ''}-run${runIndex}.png`)
    return report
  } finally {
    await b.close()
    await sleep(800)
  }
}

mkdirSync('tmp-check', { recursive: true })
const names = scenarioArg === 'all' ? Object.keys(SCENARIOS) : [scenarioArg]
for (const name of names) {
  if (!SCENARIOS[name]) throw new Error(`Unknown scenario ${name}. Known: ${Object.keys(SCENARIOS).join(', ')}`)
  const reports = []
  for (let run = 1; run <= runs; run++) {
    const report = await runOnce(name, run)
    reports.push(report)
    console.log(`${name}${tag ? ` [${tag}]` : ''} run ${run}: ${summarise(report)}${report.viewBoxMoved ? '' : ' (camera did not move)'}`)
  }
  writeFileSync(`tmp-check/perf-${name}${tag ? `-${tag}` : ''}.json`, JSON.stringify({ protocol: { warmup, sample, runs, off }, reports }, null, 2))
}
