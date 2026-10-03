import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import os from 'node:os'

// Every run has its own directory; historical evidence is never overwritten.
const output = `docs/performance/runs/${new Date().toISOString().replace(/[:.]/g, '-')}`
await mkdir(output, { recursive: true })
const headless = process.argv.includes('--headless')
const profile = process.argv.includes('--cpu')
const memoryMode = process.argv.includes('--memory')
const argument = name => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1]
const duration = Number(argument('seconds') ?? process.env.PROFILE_SECONDS ?? (profile ? 30 : 180))
const cycleDuration = Number(argument('cycle-seconds') ?? process.env.PROFILE_CYCLE_SECONDS ?? 30)
if (![duration, cycleDuration].every(n => Number.isFinite(n) && n > 0 && n <= 180))
  throw new Error('Collection durations must be finite numbers in (0, 180].')
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
const report = { date: new Date().toISOString(), output, mode: memoryMode ? 'memory' : profile ? 'cpu' : 'baseline',
  environment: { os: `${os.platform()} ${os.release()}`, cpu: os.cpus()[0]?.model,
    ram: os.totalmem(), headless, commit: git('rev-parse', 'HEAD'), localChanges: git('status', '--short'),
    viewport: { width: 1280, height: 720 }, dpr: 1,
    flags: [], throttling: 'No CDP CPU/network throttling requested; external throttling unconfirmed',
    refreshRate: 'unconfirmed', power: 'unconfirmed', concurrentProcesses: 'unconfirmed' },
  settings: { seed: 42, matchDuration: 180, spawnTime: 5, muted: false, volume: 0.45,
    requestedActiveSeconds: duration, cycleDuration, stabilizationMs: 5000 }, runs: [], cycles: [], errors: [], pauses: [] }
const browser = await chromium.launch({ headless })
try {
  report.environment.browser = browser.version()
  const browserCDP = await browser.newBrowserCDPSession()
  report.environment.systemInfo = await browserCDP.send('SystemInfo.getInfo')
  report.environment.commandLine = await browserCDP.send('Browser.getBrowserCommandLine')
  const context = await browser.newContext({ viewport: report.environment.viewport, deviceScaleFactor: 1 })
  const page = await context.newPage()
  page.on('pageerror', e => report.errors.push(e.message))
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
  await page.goto(`${process.env.PROFILE_URL ?? 'http://127.0.0.1:4175'}/?profile=1&seed=41${profile ? '&detail=1' : ''}`)
  const cdp = await context.newCDPSession(page)
  const heap = async () => ({ ...await cdp.send('Runtime.getHeapUsage'),
    ...await cdp.send('Memory.getDOMCounters'), canvases: await page.locator('canvas').count() })
  const instances = async () => {
    const result = {}
    try {
      for (const kind of ['game', 'world', 'container', 'sprite', 'texture', 'ticker', 'audio']) {
        const { result: prototype } = await cdp.send('Runtime.evaluate', {
          expression: `window.__combatProfilePrototypes.${kind}`, objectGroup: 'counts' })
        const { objects } = await cdp.send('Runtime.queryObjects', { prototypeObjectId: prototype.objectId, objectGroup: 'counts' })
        const { result: count } = await cdp.send('Runtime.callFunctionOn', {
          objectId: objects.objectId, functionDeclaration: 'function() { return this.length }', returnByValue: true })
        result[kind] = count.value
      }
    } finally { await cdp.send('Runtime.releaseObjectGroup', { objectGroup: 'counts' }) }
    return result
  }
  const snapshot = async name => {
    const chunks = []
    const receive = ({ chunk }) => chunks.push(chunk)
    cdp.on('HeapProfiler.addHeapSnapshotChunk', receive)
    try { await cdp.send('HeapProfiler.takeHeapSnapshot') }
    finally { cdp.off('HeapProfiler.addHeapSnapshotChunk', receive) }
    await writeFile(`${output}/${name}.heapsnapshot`, chunks.join(''))
  }
  const start = async () => {
    const begun = Date.now()
    await page.evaluate(() => history.replaceState(null, '', '/?profile=1&seed=41'))
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await page.waitForFunction(() => window.__combatProfile?.())
    await page.bringToFront()
    report.environment.game = await page.evaluate(() => window.__combatProfileEnvironment())
    report.environment.game.clickToReadyMs = Date.now() - begun
    console.log(JSON.stringify({ renderer: report.environment.systemInfo.gpu.auxAttributes.glRenderer,
      game: report.environment.game.rendererName, startupMs: report.environment.game.startupMs }))
  }
  const exit = async () => {
    if (await page.getByRole('button', { name: 'Pause', exact: true }).isVisible())
      await page.getByRole('button', { name: 'Pause', exact: true }).click()
    await page.getByRole('button', { name: 'Main Menu', exact: true }).click()
    await page.locator('canvas').waitFor({ state: 'detached' })
  }
  const held = new Set()
  let terrain = []
  // Controller geometry runs in Node, outside the browser main-thread measurement.
  const safe = (x, y, radius = 70) => {
    if (x < radius || y < radius || x > 4000 - radius || y > 4000 - radius) return false
    for (const collider of terrain) {
      if (collider.type === 'circle') {
        if (Math.hypot(x - collider.position.x, y - collider.position.y) < radius + collider.radius) return false
      } else {
        let inside = false
        const vertices = collider.vertices
        for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
          const a = vertices[j], b = vertices[i], dx = b.x - a.x, dy = b.y - a.y
          if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside
          const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)))
          if (Math.hypot(x - a.x - t * dx, y - a.y - t * dy) < radius) return false
        }
        if (inside) return false
      }
    }
    return true
  }
  const clearHeading = (player, angle, length) => [0, 0.25, 0.5, 0.75, 1].every(f =>
    safe(player.x + Math.sin(angle) * length * f, player.y - Math.cos(angle) * length * f))
  const input = async codes => {
    for (const key of [...held]) if (!codes.includes(key)) { await page.keyboard.up(key); held.delete(key) }
    for (const key of codes) if (!held.has(key)) { await page.keyboard.down(key); held.add(key) }
  }
  const play = async seconds => {
    terrain = report.environment.game.terrain ?? []
    await page.evaluate(() => window.__combatProfileBegin())
    const begun = Date.now(), initial = await page.evaluate(() => window.__combatProfile())
    if (initial.seed !== 42) throw new Error(`Unexpected effective seed: ${initial.seed}`)
    let peakHeap = 0, lastHeap = 0, lastPosition = initial.player, stuck = 0, pauseStarted
    const inputs = []
    while (Date.now() - begun < seconds * 4000 + 30000) {
      const s = await page.evaluate(() => window.__combatProfile())
      if (!s || s.gameOver || s.time - initial.time >= seconds) break
      if (s.paused) {
        pauseStarted ??= Date.now()
        await input([])
        await page.waitForTimeout(250)
        if (Date.now() - pauseStarted > 10000) { report.pauses.push({ time: s.time, wallMs: Date.now() - pauseStarted, reason: 'automatic pause; run stopped' }); break }
        continue
      }
      if (!s.focused || s.visible !== 'visible') { report.pauses.push({ time: s.time, reason: 'lost visibility/focus' }); break }
      const distance = Math.hypot(s.player.x - lastPosition.x, s.player.y - lastPosition.y)
      stuck = distance < 2 ? stuck + 1 : 0; lastPosition = s.player
      const nearest = [...s.enemies].sort((a, b) => Math.hypot(a.x - s.player.x, a.y - s.player.y) - Math.hypot(b.x - s.player.x, b.y - s.player.y))[0]
      const low = s.hp < 75
      const goal = nearest ? { x: nearest.x, y: nearest.y } : { x: 1000, y: 1000 }
      const range = Math.hypot(goal.x - s.player.x, goal.y - s.player.y)
      let angle = Math.atan2(goal.x - s.player.x, -(goal.y - s.player.y))
      // Sail a broadside orbit, with an outward component inside 340 units.
      if (range < 450) angle += Math.PI / 2 + Math.max(0, (340 - range) / 340) * Math.PI / 2
      if (low && range < 500) angle = Math.atan2(goal.x - s.player.x, -(goal.y - s.player.y)) + Math.PI
      if (stuck > 8) angle += Math.PI / 2
      let best = -Infinity, selected = angle
      for (let i = 0; i < 24; i++) {
        const candidate = i * Math.PI / 12
        if (!clearHeading(s.player, candidate, 230)) continue
        const score = Math.cos(candidate - angle) + 0.25 * Math.cos(candidate - s.player.rotation)
        if (score > best) { best = score; selected = candidate }
      }
      angle = selected
      const delta = Math.atan2(Math.sin(angle - s.player.rotation), Math.cos(angle - s.player.rotation))
      const codes = ['Space', 'KeyQ', 'KeyE']
      if (Math.abs(delta) > 0.18) codes.push(delta > 0 ? 'KeyD' : 'KeyA')
      if (clearHeading(s.player, s.player.rotation, 140)) codes.push('KeyW')
      // Repair uses the real R input. Its normal movement-cancellation rule remains active.
      if (low && range > 500 && Math.floor(s.time) % 35 < 6) { codes.splice(3); codes.push('KeyR') }
      await input(codes)
      inputs.push({ wallMs: Date.now() - begun, gameTime: s.time, codes })
      if (memoryMode && Date.now() - lastHeap > 1000) {
        peakHeap = Math.max(peakHeap, (await heap()).usedSize); lastHeap = Date.now()
      }
      await page.waitForTimeout(80)
    }
    await input([])
    const data = await page.evaluate(() => window.__combatProfileEnd())
    report.pauses.push(...(data.pauses ?? []))
    data.wallSeconds = (Date.now() - begun) / 1000
    data.initial = initial
    data.activeSeconds = (data.final?.time ?? data.samples.at(-1)?.time ?? initial.time) - initial.time
    data.persistedResult = await page.evaluate(() => JSON.parse(localStorage.getItem('pirate-battle-lastCompletedMatch-v1') ?? 'null'))
    data.complete = seconds === 180 && (data.final?.time === 180 && data.final?.gameOver
      || data.samples.at(-1)?.time >= 179 && data.persistedResult?.match?.endReason === 'timeExpired'
      && data.persistedResult?.match?.effectiveDuration === 180)
    data.requestedSeconds = seconds
    data.reachedRequestedDuration = data.activeSeconds >= seconds - 0.1
    data.sampledPeakHeap = peakHeap
    data.inputs = inputs
    return data
  }
  await start()
  if (profile) {
    await cdp.send('Profiler.enable'); await cdp.send('Profiler.start')
    await cdp.send('Tracing.start', { categories: 'devtools.timeline,v8,blink.user_timing,gpu', transferMode: 'ReturnAsStream' })
  }
  report.runs.push(await play(duration))
  if (profile) {
    const { profile: cpu } = await cdp.send('Profiler.stop')
    await writeFile(`${output}/combat.cpuprofile`, JSON.stringify(cpu))
    const completed = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve))
    await cdp.send('Tracing.end')
    const { stream } = await completed
    let raw = ''
    for (;;) {
      const chunk = await cdp.send('IO.read', { handle: stream })
      raw += chunk.data
      if (chunk.eof) break
    }
    await cdp.send('IO.close', { handle: stream })
    await writeFile(`${output}/timeline.json`, raw)
  }
  await page.screenshot({ path: `${output}/after-combat.png` })
  await exit()
  if (memoryMode) {
    await page.waitForTimeout(5000)
    report.cycles.push({ cycle: 0, normal: await heap() })
    await snapshot('warm-baseline')
    report.cycles[0].postSnapshot = await heap()
    report.baselineInstancesDiagnostic = await instances()
    for (let cycle = 1; cycle <= 5; cycle++) {
      await start()
      const data = await play(cycleDuration)
      report.runs.push(data)
      await exit(); await page.waitForTimeout(5000)
      report.cycles.push({ cycle, activeSeconds: data.activeSeconds, sampledPeakHeap: data.sampledPeakHeap, normal: await heap() })
      console.log(`Memory ${cycle}/5: ${data.activeSeconds.toFixed(2)} active seconds`)
    }
    await snapshot('after-five-cycles')
    await cdp.send('HeapProfiler.collectGarbage')
    report.forcedGcDiagnostic = await heap()
    report.finalInstancesDiagnostic = await instances()
  }
} catch (error) { report.failure = String(error); process.exitCode = 1 }
finally {
  await writeFile(`${output}/measurements.json`, JSON.stringify(report, null, 2))
  await browser.close()
  console.log(output)
}
