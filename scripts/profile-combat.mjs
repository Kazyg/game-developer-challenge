import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'

const baseURL = process.env.PROFILE_URL ?? 'http://127.0.0.1:4175'
const investigateMemory = process.argv.includes('--memory')
const seconds = investigateMemory ? 15 : Number(process.env.PROFILE_SECONDS ?? 180)
const outputDirectory = `docs/performance/legacy-runs/${new Date().toISOString().replace(/[:.]/g, '-')}${investigateMemory ? '-memory' : ''}`
await mkdir(outputDirectory, { recursive: true })
async function heapSnapshot(cdp, name) {
  const chunks = []
  const collect = ({ chunk }) => chunks.push(chunk)
  cdp.on('HeapProfiler.addHeapSnapshotChunk', collect)
  try { await cdp.send('HeapProfiler.takeHeapSnapshot') }
  finally { cdp.off('HeapProfiler.addHeapSnapshotChunk', collect) }
  const raw = chunks.join('')
  await writeFile(`${outputDirectory}/${name}.heapsnapshot`, raw)
  const heap = JSON.parse(raw), fields = heap.snapshot.meta.node_fields
  const width = fields.length, typeIndex = fields.indexOf('type'), nameIndex = fields.indexOf('name'), sizeIndex = fields.indexOf('self_size')
  const types = heap.snapshot.meta.node_types[typeIndex]
  const groups = new Map()
  for (let offset = 0; offset < heap.nodes.length; offset += width) {
    const type = types[heap.nodes[offset + typeIndex]]
    const key = `${type}:${heap.strings[heap.nodes[offset + nameIndex]]}`
    const group = groups.get(key) ?? { count: 0, bytes: 0 }
    group.count++; group.bytes += heap.nodes[offset + sizeIndex]; groups.set(key, group)
  }
  return Object.fromEntries(groups)
}
const browser = await chromium.launch()
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    const randomValues = crypto.getRandomValues.bind(crypto)
    crypto.getRandomValues = array => {
      if (array instanceof Uint32Array && array.length === 1) { array[0] = 42; return array }
      return randomValues(array)
    }
    localStorage.setItem('pirate-battle-duration', '180')
    localStorage.setItem('pirate-battle-spawn-time', '5')
    localStorage.setItem('pirate-battle-audio-v1', JSON.stringify({ muted: true, volume: 0 }))
  })
  await page.goto(`${baseURL}/?profile=1&seed=41`)
  const cdp = await context.newCDPSession(page)
  await cdp.send('Performance.enable')
  const gpu = await browser.newBrowserCDPSession()
  const system = await gpu.send('SystemInfo.getInfo')
  const memory = async () => {
    await cdp.send('HeapProfiler.collectGarbage')
    const heap = await cdp.send('Runtime.getHeapUsage')
    const dom = await cdp.send('Memory.getDOMCounters')
    return { ...heap, ...dom, canvases: await page.locator('canvas').count() }
  }
  const instanceCounts = async () => {
    const counts = {}
    try {
      for (const kind of ['game', 'world']) {
        const { result: prototype } = await cdp.send('Runtime.evaluate', { expression: `window.__combatProfilePrototypes.${kind}`, objectGroup: 'profile-counts' })
        const { objects } = await cdp.send('Runtime.queryObjects', { prototypeObjectId: prototype.objectId, objectGroup: 'profile-counts' })
        const { result } = await cdp.send('Runtime.callFunctionOn', { objectId: objects.objectId, functionDeclaration: 'function() { return this.length }', returnByValue: true })
        counts[kind] = result.value
      }
    } finally { await cdp.send('Runtime.releaseObjectGroup', { objectGroup: 'profile-counts' }) }
    return counts
  }
  const start = async () => {
    // New-match seed generation remains real; only its entropy is controlled.
    await page.evaluate(() => history.replaceState(null, '', '/?seed=41'))
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await page.locator('canvas').waitFor()
    await page.waitForFunction(() => window.__combatProfile?.() != null)
  }
  const exit = async () => {
    if (await page.getByRole('button', { name: 'Pause', exact: true }).isVisible()) {
      await page.getByRole('button', { name: 'Pause', exact: true }).click()
    }
    await page.getByRole('button', { name: 'Main Menu', exact: true }).click()
    await page.locator('canvas').waitFor({ state: 'detached' })
  }
  await start()
  const constructors = await page.evaluate(() => window.__combatProfileTypes)
  if (investigateMemory) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.start') }
  await page.keyboard.down('Space')
  await page.keyboard.down('KeyQ')
  await page.keyboard.down('KeyE')
  console.log(`Measuring ${seconds}s of real combat in production...`)
  const frames = await page.evaluate(async seconds => {
    const intervals = [], samples = []
    let previous, lastSample = -1
    const begun = performance.now()
    await new Promise(resolve => {
      const frame = now => {
        const state = window.__combatProfile()
        if (!state || state.gameOver || now - begun >= seconds * 1000) { resolve(); return }
        if (previous !== undefined) intervals.push(now - previous)
        previous = now
        if (Math.floor(state.time) !== lastSample) {
          lastSample = Math.floor(state.time)
          samples.push({ wallMs: now - begun, ...state })
        }
        requestAnimationFrame(frame)
      }
      requestAnimationFrame(frame)
    })
    return { intervals, samples, wallMs: performance.now() - begun, final: window.__combatProfile() }
  }, seconds)
  if (investigateMemory) {
    const { profile } = await cdp.send('Profiler.stop')
    await writeFile(`${outputDirectory}/combat.cpuprofile`, JSON.stringify(profile))
  }
  for (const key of ['Space', 'KeyQ', 'KeyE']) await page.keyboard.up(key)
  const completed = await page.evaluate(() => JSON.parse(localStorage.getItem('pirate-battle-lastCompletedMatch-v1') ?? 'null'))
  await page.screenshot({ path: `${outputDirectory}/combat.png` })
  // Allow the normal result transition if the match ended on the last frame.
  if (frames.final?.gameOver) await page.getByRole('button', { name: 'Main Menu', exact: true }).waitFor()
  await exit()
  const cycles = [{ cycle: 0, ...await memory() }]
  const baselineInstances = investigateMemory ? await instanceCounts() : undefined
  const baseline = investigateMemory ? await heapSnapshot(cdp, 'baseline') : undefined
  for (let cycle = 1; cycle <= 5; cycle++) {
    await start()
    await page.keyboard.down('Space')
    await page.waitForTimeout(5000)
    await page.keyboard.up('Space')
    await exit()
    cycles.push({ cycle, ...await memory() })
    console.log(`Memory cycle ${cycle}/5 completed`)
  }
  const finalHeap = investigateMemory ? await heapSnapshot(cdp, 'after-five-cycles') : undefined
  const finalInstances = investigateMemory ? await instanceCounts() : undefined
  const heapChanges = baseline && finalHeap ? [...new Set([...Object.keys(baseline), ...Object.keys(finalHeap)])].map(name => ({
    name, before: baseline[name] ?? { count: 0, bytes: 0 }, after: finalHeap[name] ?? { count: 0, bytes: 0 },
    byteDelta: (finalHeap[name]?.bytes ?? 0) - (baseline[name]?.bytes ?? 0),
  })).sort((a, b) => b.byteDelta - a.byteDelta) : undefined
  const sorted = [...frames.intervals].sort((a, b) => a - b)
  const total = frames.intervals.reduce((sum, value) => sum + value, 0)
  const report = {
    date: new Date().toISOString(), environment: { platform: os.platform(), release: os.release(),
      cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length, memoryBytes: os.totalmem(),
      browser: browser.version(), gpu: system.gpu, headless: true, viewport: { width: 1280, height: 720 }, dpr: 1 },
    config: { seed: 42, duration: 180, spawnTime: 5, muted: true, controls: ['Space', 'KeyQ', 'KeyE'] },
    measurement: { requestedSeconds: seconds, fps: frames.intervals.length * 1000 / total,
      p95FrameMs: sorted[Math.ceil(sorted.length * 0.95) - 1], frameCount: sorted.length,
      peakEntities: Math.max(...frames.samples.map(s => s.ships + s.projectiles + s.effects + s.wrecks + s.islands)) },
    frames, completed, cycles, errors, memoryInvestigation: heapChanges ? { constructors,
      instancesByPrototype: { before: baselineInstances, after: finalInstances },
      topChanges: heapChanges.slice(0, 30) } : undefined,
  }
  await writeFile(`${outputDirectory}/measurements.json`, JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ measurement: report.measurement, final: frames.final, cycles, errors }, null, 2))
} finally { await browser.close() }
