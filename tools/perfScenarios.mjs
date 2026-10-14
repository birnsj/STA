// Dev-only: the benchmark scenarios shared by tools/perfRun.mjs (frame stats) and tools/perfProfile.mjs (CPU profile).
// Each scenario is { setup(browser), drive(browser, seconds) } or { setup, makeDrive() } when the drive keeps state.
import { readFileSync } from 'node:fs'
import { sleep } from './perfBrowser.mjs'

const PARTY = ['Ambrose Varga', 'Quentin Strand', 'Desmond Alcott', 'Emeka Petrov']

const args = process.argv.slice(2)
export const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`)
  return at >= 0 ? args[at + 1] : fallback
}
// The dev server by default; --base http://127.0.0.1:4173/ measures a preview of a VITE_PERF_PROBE=1 production build.
const BASE = flag('base', 'http://127.0.0.1:5173/')
// Dev-only ablations: probe flags (src/dev/perfProbe.js) plus the runner-side 'scrollpulse'.
export const off = flag('off', '')
// --board svg measures the SVG exploration board (ExplorationScreen ?board=svg) instead of the Pixi one.
const board = flag('board', '')

const clickScript = (text) =>
  `(()=>{const x=[...document.querySelectorAll('button')].find(x=>x.textContent.trim().startsWith(${JSON.stringify(text)})&&!x.disabled); if(x) x.click(); return !!x})()`

async function click(b, text, { wait = 800, required = true } = {}) {
  const ok = await b.evaluate(clickScript(text))
  if (!ok && required) throw new Error(`Button not found: ${text}`)
  await sleep(wait)
  return ok
}

// The probe's frame and heap sampler, injected when the app hasn't installed it (a production build made without
// VITE_PERF_PROBE=1): its module text run as a script with the build-mode test forced on.
const PROBE_SCRIPT = `(() => {${readFileSync(new URL('../src/dev/perfProbe.js', import.meta.url), 'utf8')
  .replace(/import\.meta\.env\?\.DEV \|\| import\.meta\.env\?\.VITE_PERF_PROBE/, 'true')
  .replace(/^export /gm, '')}})()`

async function openPage(b) {
  await b.send('Page.navigate', { url: `${BASE}?perf=1${off ? `&off=${off}` : ''}${board ? `&board=${board}` : ''}` })
  await sleep(2500)
  await b.evaluate(`window.__perf ? 0 : ${PROBE_SCRIPT}`)
  // Runner-side ablation (no app code): stops the pulsing scrollbar colour animated on <html> (base.css).
  if (off.split(',').includes('scrollpulse')) await b.evaluate(`document.documentElement.style.animation = 'none'`)
}

// Main menu -> episode -> away team -> exploration, past the intro. Lands on the episode's first location.
async function enterExploration(b) {
  await openPage(b)
  await click(b, 'Load Episode')
  await click(b, 'Game')
  await click(b, 'Shadows on Deck Twelve')
  for (const name of PARTY) await click(b, name, { wait: 150 })
  await click(b, 'Start Exploration', { wait: 1500 })
  await click(b, 'Skip Intro', { wait: 6000, required: false })
}

// Walks the party to the challenge object nearest the screen centre by clicking its art, then waits for the walk. Needs
// a party member within reach, so the object glows (the in-reach outline filter plus its CSS pulse). Throws if none does:
// a scenario that silently measured no glow would be misleading.
async function enterReachOfObject(b) {
  await enterExploration(b)
  const target = await b.evaluate(`(()=>{
    const items = [...document.querySelectorAll('g.object-highlight')].map((g) => { const r = g.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
      .filter((p) => p.x > 150 && p.x < 1130 && p.y > 120 && p.y < 560)
    items.sort((a, b) => Math.hypot(a.x - 640, a.y - 360) - Math.hypot(b.x - 640, b.y - 360))
    return items[0] ?? null
  })()`)
  if (!target) throw new Error('No challenge object on screen to walk to')
  await b.mouse('mousePressed', target.x, target.y)
  await sleep(120)
  await b.mouse('mouseReleased', target.x, target.y)
  await sleep(12000)
  const inReach = await b.evaluate(`document.querySelectorAll('g.object-highlight.is-in-reach').length`)
  if (!inReach) throw new Error('The party did not come within reach of an object')
}

export const viewBoxOf = (b) => b.evaluate(`document.querySelector('svg.exploration-board')?.getAttribute('viewBox') ?? null`)

// Hold-to-steer toward alternating screen points, so the lead walks and the camera follows. Real mouse input.
async function walkAround(b, seconds) {
  const stage = await b.evaluate(`(()=>{const r=document.querySelector('svg.exploration-board').getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}})()`)
  const legs = [
    [260, 120],
    [-260, -120],
    [260, -120],
    [-260, 120],
  ]
  const end = Date.now() + seconds * 1000
  let leg = 0
  while (Date.now() < end) {
    const [dx, dy] = legs[leg++ % legs.length]
    await b.mouse('mousePressed', stage.x + dx, stage.y + dy)
    await sleep(Math.min(3000, Math.max(0, end - Date.now())))
    await b.mouse('mouseReleased', stage.x + dx, stage.y + dy)
  }
}

// Combat setup is the same for both combat scenarios: "Combat" prototype, the same party, past the how-to-play card.
async function enterCombat(b) {
  await openPage(b)
  await click(b, 'Load Episode')
  await click(b, 'Combat')
  await click(b, 'Shadows on Deck Twelve')
  for (const name of PARTY) await click(b, name, { wait: 150 })
  await click(b, 'Start Combat', { wait: 3000 })
  await click(b, 'Got it', { wait: 500, required: false })
}

// Auto Combat plays both sides. It is started once; the warm-up and sample windows both run inside the same fight.
function combatAuto() {
  let started = false
  return async (b, seconds) => {
    if (!started) {
      await click(b, 'Auto Combat', { wait: 0 })
      started = true
    }
    await sleep(seconds * 1000)
  }
}

async function enterEditor(b) {
  await openPage(b)
  await click(b, 'Dev Edit', { wait: 1500 })
  await click(b, 'Load', { wait: 800 })
  await click(b, 'Deck 10 Brig', { wait: 3000 })
}

// The editor only does work in response to the pointer, so the realistic load is the mouse sweeping the board.
async function sweepBoard(b, seconds) {
  const end = Date.now() + seconds * 1000
  const centre = { x: 640, y: 380 }
  for (let step = 0; Date.now() < end; step++) {
    const angle = step / 25
    await b.mouse('mouseMoved', centre.x + Math.cos(angle) * 300, centre.y + Math.sin(angle * 1.3) * 200)
    await sleep(16)
  }
}

const idle = (b, seconds) => sleep(seconds * 1000)

export const SCENARIOS = {
  // 1. Idle exploration: the party stands still, nothing but the world clock and the animated tiles run.
  'explore-idle': { setup: enterExploration, drive: idle },
  // 2. The lead walks around, the camera follows, followers path behind.
  'explore-move': { setup: enterExploration, drive: walkAround },
  // Extra: standing next to a challenge object, so its in-reach glow and pulse are on screen (hazard-readiness budget).
  'explore-object': { setup: enterReachOfObject, drive: idle },
  // 4. Combat idle: the player's turn, nobody acts.
  'combat-idle': { setup: enterCombat, drive: idle },
  // 5. Combat with attacks and moves: Auto Combat.
  'combat-auto': { setup: enterCombat, makeDrive: combatAuto },
  // 6. Map editor, same map: idle, and with the pointer sweeping the board.
  'editor-idle': { setup: enterEditor, drive: idle },
  'editor-sweep': { setup: enterEditor, drive: sweepBoard },
}
