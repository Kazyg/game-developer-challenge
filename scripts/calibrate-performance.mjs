import { chromium } from '@playwright/test'
import { readFile, mkdir, writeFile } from 'node:fs/promises'

const source = process.argv[2]
if (!source) throw new Error('Usage: node scripts/calibrate-performance.mjs <CPU-run measurements.json>')
const inputRun = JSON.parse(await readFile(source, 'utf8')).runs[0]
const inputs = inputRun.inputs.filter(i => i.wallMs < 20000)
if (!inputs.length) throw new Error('Source run has no recorded input schedule')
const output = `docs/performance/runs/${new Date().toISOString().replace(/[:.]/g, '-')}-calibration`
await mkdir(output, { recursive: true })
const results = []
for (const condition of ['hardware-unobserved', 'hardware-observed', 'software-observed']) {
  const flags = condition.startsWith('software') ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : []
  const browser = await chromium.launch({ headless: false, args: flags })
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })
    const page = await context.newPage()
    await page.addInitScript(() => {
      const original = crypto.getRandomValues.bind(crypto)
      crypto.getRandomValues = array => {
        if (array instanceof Uint32Array && array.length === 1) { array[0] = 42; return array }
        return original(array)
      }
      localStorage.setItem('pirate-battle-duration', '180')
      localStorage.setItem('pirate-battle-spawn-time', '5')
      localStorage.setItem('pirate-battle-audio-v1', JSON.stringify({ muted: false, volume: 0.45 }))
    })
    await page.goto(`${process.env.PROFILE_URL ?? 'http://127.0.0.1:4175'}/?seed=41${condition.endsWith('unobserved') ? '' : '&profile=1'}`)
    const cdp = await browser.newBrowserCDPSession()
    const system = await cdp.send('SystemInfo.getInfo')
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await page.locator('canvas').waitFor()
    await page.bringToFront()
    // One lightweight rAF collector is common to every condition.
    await page.evaluate(() => {
      window.__calibration = { intervals: [], paused: [], begun: performance.now(), previous: null, active: true }
      const frame = now => {
        const c = window.__calibration
        if (!c.active) return
        if (document.visibilityState !== 'visible' || !document.hasFocus()) c.paused.push(now)
        if (c.previous !== null) c.intervals.push(now - c.previous)
        c.previous = now; requestAnimationFrame(frame)
      }
      requestAnimationFrame(frame)
      window.__combatProfileBegin?.()
    })
    const begun = Date.now(), held = new Set()
    for (const item of inputs) {
      const delay = item.wallMs - (Date.now() - begun)
      if (delay > 0) await page.waitForTimeout(delay)
      for (const key of [...held]) if (!item.codes.includes(key)) { await page.keyboard.up(key); held.delete(key) }
      for (const key of item.codes) if (!held.has(key)) { await page.keyboard.down(key); held.add(key) }
    }
    const remaining = 20000 - (Date.now() - begun)
    if (remaining > 0) await page.waitForTimeout(remaining)
    const data = await page.evaluate(() => {
      window.__calibration.active = false
      return { ...window.__calibration, state: window.__combatProfile?.(), observer: window.__combatProfileEnd?.(),
        canvas: document.querySelector('canvas') !== null }
    })
    for (const key of held) await page.keyboard.up(key)
    const sum = data.intervals.reduce((a, b) => a + b, 0), sorted = [...data.intervals].sort((a, b) => a - b)
    results.push({ condition, flags, gpu: system.gpu, browser: browser.version(),
      fps: data.intervals.length * 1000 / sum, p95: sorted[Math.ceil(sorted.length * 0.95) - 1], data })
    console.log(condition, results.at(-1).fps)
  } finally { await browser.close() }
}
await writeFile(`${output}/calibration.json`, JSON.stringify({ source, seconds: 20, inputs, results,
  limitations: 'Sequential single trials, same wall-clock input schedule; simulation trajectories can diverge under software rendering. Common lightweight collector overhead not measured. No screenshots/tracing/CPU sampling.' }, null, 2))
console.log(output)
