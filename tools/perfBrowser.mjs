// Dev-only: drives a real Chrome over the DevTools protocol for the performance benchmarks (tools/perfRun.mjs).
// Why not the IDE's embedded browser: its compositor throttles requestAnimationFrame to ~2 fps when the pane isn't
// being watched, so frame cadence can't be measured there. A headed Chrome with the throttling switches below can.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

// The profile lives outside the project: Vite's file watcher crashes on Chrome's locked profile files.

const CHROME_PATHS = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export async function launchBrowser({ port = 9333, width = 1280, height = 720, profile = path.join(tmpdir(), 'st-perf-chrome-profile') } = {}) {
  const exe = CHROME_PATHS.find((candidate) => existsSync(candidate))
  if (!exe) throw new Error('No Chrome or Edge found')
  const profileDir = path.resolve(profile)
  rmSync(profileDir, { recursive: true, force: true })
  mkdirSync(profileDir, { recursive: true })
  const child = spawn(
    exe,
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profileDir}`,
      `--window-size=${width},${height + 140}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-background-timer-throttling',
      '--disable-features=CalculateNativeWinOcclusion',
      'about:blank',
    ],
    { stdio: 'ignore' },
  )
  let targets = null
  for (let attempt = 0; attempt < 50 && !targets; attempt++) {
    await sleep(200)
    try {
      targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
    } catch {
      /* still starting */
    }
  }
  if (!targets) throw new Error('Chrome did not start')
  const page = targets.find((target) => target.type === 'page')
  const socket = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.onopen = resolve
    socket.onerror = reject
  })
  let nextId = 1
  const pending = new Map()
  socket.onmessage = (message) => {
    const data = JSON.parse(message.data)
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id)
      pending.delete(data.id)
      if (data.error) reject(new Error(`${data.error.message}`))
      else resolve(data.result)
    }
  }
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++
      pending.set(id, { resolve, reject })
      socket.send(JSON.stringify({ id, method, params }))
    })

  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
  await send('Emulation.setFocusEmulationEnabled', { enabled: true })

  // Evaluates an expression in the page; async expressions are awaited. Returns the value.
  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)
    return result.result.value
  }
  async function mouse(type, x, y, button = 'left') {
    await send('Input.dispatchMouseEvent', { type, x, y, button, buttons: type === 'mousePressed' ? 1 : 0, clickCount: type === 'mouseMoved' ? 0 : 1, pointerType: 'mouse' })
  }
  async function screenshot(file) {
    const { data } = await send('Page.captureScreenshot', { format: 'png' })
    const { writeFileSync } = await import('node:fs')
    writeFileSync(file, Buffer.from(data, 'base64'))
  }
  async function close() {
    try {
      await send('Browser.close')
    } catch {
      /* already closing */
    }
    child.kill()
  }
  return { send, evaluate, mouse, screenshot, close }
}
