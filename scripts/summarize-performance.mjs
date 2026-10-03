import { readFile, writeFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping'

const percentile = values => values.length ? [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1] : null
const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
const directories = process.argv.slice(2).length ? process.argv.slice(2) :
  (await readdir('docs/performance/runs')).map(name => `docs/performance/runs/${name}`)
for (const dir of directories) {
  let report
  try { report = JSON.parse(await readFile(`${dir}/measurements.json`, 'utf8')) } catch { continue }
  const summaries = report.runs.map(run => {
    const frames = run.frames, samples = run.samples
    const wallMs = frames.reduce((sum, f) => sum + f.intervalMs, 0)
    const bins = new Map()
    for (const frame of frames) {
      const bin = Math.floor(frame.time / 10) * 10
      const list = bins.get(bin) ?? []; list.push(frame); bins.set(bin, list)
    }
    const entityStats = Object.fromEntries(['chasers', 'shooters', 'ships', 'projectiles', 'effects', 'wrecks', 'islands', 'engaged'].map(key =>
      [key, { mean: mean(samples.map(s => s[key])), max: Math.max(0, ...samples.map(s => s[key])) }]))
    return { complete: run.complete, activeSeconds: run.activeSeconds, wallSeconds: run.wallSeconds,
      collectionSeconds: wallMs / 1000, startupMs: run.startupMs, rafIntervals: frames.length,
      fps: frames.length * 1000 / wallMs, p95Ms: percentile(frames.map(f => f.intervalMs)),
      over16_67: frames.filter(f => f.intervalMs > 16.67).length,
      over33_33: frames.filter(f => f.intervalMs > 33.33).length,
      over50: frames.filter(f => f.intervalMs > 50).length,
      renderCalls: frames.reduce((a, f) => a + f.renders, 0),
      renderCallsPerSecond: frames.reduce((a, f) => a + f.renders, 0) * 1000 / wallMs,
      simulationSteps: frames.reduce((a, f) => a + f.steps, 0),
      stepsPerFrame: mean(frames.map(f => f.steps)), maxStepsPerFrame: Math.max(0, ...frames.map(f => f.steps)),
      maxBacklogSeconds: Math.max(0, ...frames.map(f => f.backlogSeconds)),
      meanSimulationMs: mean(frames.map(f => f.simulationMs)), p95SimulationMs: percentile(frames.map(f => f.simulationMs)),
      meanRendererSubmissionMs: mean(frames.map(f => f.rendererMs)), p95RendererSubmissionMs: percentile(frames.map(f => f.rendererMs)),
      minHp: Math.min(100, ...samples.map(s => s.hp)), maxScore: Math.max(0, ...samples.map(s => s.score)), entityStats,
      intervals: [...bins].map(([from, list]) => ({ from, fps: list.length * 1000 / list.reduce((a, f) => a + f.intervalMs, 0),
        p95Ms: percentile(list.map(f => f.intervalMs)) })) }
  })
  await writeFile(`${dir}/summary.json`, JSON.stringify({ mode: report.mode, failure: report.failure, runs: summaries,
    cycles: report.cycles, forcedGcDiagnostic: report.forcedGcDiagnostic,
    baselineInstancesDiagnostic: report.baselineInstancesDiagnostic, finalInstancesDiagnostic: report.finalInstancesDiagnostic }, null, 2))
  if (report.cycles.length) {
    const normal = report.cycles.map(c => [c.cycle, c.normal.usedSize / 1048576])
    const peaks = report.cycles.filter(c => c.cycle > 0).map(c => [c.cycle, c.sampledPeakHeap / 1048576])
    const max = Math.max(50, ...normal.map(p => p[1]), ...peaks.map(p => p[1]))
    const point = ([cycle, mib]) => `${70 + cycle * 135},${310 - mib / max * 230}`
    const svg = ['<svg xmlns="http://www.w3.org/2000/svg" width="800" height="390"><rect width="800" height="390" fill="white"/>',
      '<text x="60" y="30" font-family="sans-serif" font-size="18">JavaScript heap (MiB), warm menu and five cycles</text>',
      '<text x="60" y="55" font-family="sans-serif" font-size="13">Blue: normal menu after 5s. Red: sampled combat peak. Black: GC diagnostics.</text>']
    for (let i = 0; i <= 5; i++) svg.push(`<path d="M70 ${310 - i * 46}H745" stroke="#ddd"/><text x="10" y="${315 - i * 46}" font-family="sans-serif">${(max * i / 5).toFixed(0)}</text>`,
      `<text x="${70 + i * 135}" y="340" font-family="sans-serif">${i}</text>`)
    for (const [data, color] of [[normal, '#1565c0'], [peaks, '#c62828']]) svg.push(`<polyline fill="none" stroke="${color}" stroke-width="2" points="${data.map(point).join(' ')}"/>`)
    const diagnostics = [[0, report.cycles[0].postSnapshot?.usedSize / 1048576], [5, report.forcedGcDiagnostic?.usedSize / 1048576]]
    for (const p of diagnostics) if (Number.isFinite(p[1])) {
      const [x, y] = point(p).split(','); svg.push(`<circle cx="${x}" cy="${y}" r="5" fill="black"/>`)
    }
    svg.push('<text x="60" y="375" font-family="sans-serif" font-size="12">Snapshot/queryObjects baseline can trigger GC; this is not an intervention-free sequence.</text></svg>')
    await writeFile(`${dir}/memory-chart.svg`, svg.join('\n'))
  }
  const first = report.runs[0]
  if (first?.frames.length) {
    const bins = new Map()
    for (const f of first.frames) { const t = Math.floor(f.time); const list = bins.get(t) ?? []; list.push(f); bins.set(t, list) }
    const series = [...bins].map(([t, list]) => ({ t, fps: list.length * 1000 / list.reduce((a, f) => a + f.intervalMs, 0), p95: percentile(list.map(f => f.intervalMs)) }))
    const panels = [
      { label: 'rAF FPS per active second (not physical presentation)', max: 65, values: series.map(s => [s.t, s.fps]), color: '#1565c0' },
      { label: 'p95 interval per active second (ms)', max: Math.max(55, ...series.map(s => s.p95)), values: series.map(s => [s.t, s.p95]), color: '#c62828' },
      { label: 'Entities: ships blue, projectiles red, effects green', max: Math.max(45, ...first.samples.map(s => s.ships + s.projectiles + s.effects)),
        values: first.samples.map(s => [s.time, s.ships]), color: '#1565c0', extra: [
          { values: first.samples.map(s => [s.time, s.projectiles]), color: '#c62828' },
          { values: first.samples.map(s => [s.time, s.effects]), color: '#2e7d32' }] },
    ]
    const end = Math.max(1, first.samples.at(-1)?.time ?? 180)
    const parts = ['<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="750" viewBox="0 0 1000 750"><rect width="1000" height="750" fill="white"/>']
    panels.forEach((panel, i) => {
      const top = 40 + i * 245
      parts.push(`<text x="60" y="${top}" font-family="sans-serif" font-size="16">${panel.label}</text>`)
      for (let j = 0; j <= 4; j++) {
        const y = top + 25 + j * 40
        parts.push(`<path d="M60 ${y}H960" stroke="#ddd"/><text x="5" y="${y + 5}" font-family="sans-serif" font-size="12">${(panel.max * (1 - j / 4)).toFixed(1)}</text>`)
      }
      for (const s of [panel, ...(panel.extra ?? [])]) parts.push(`<polyline fill="none" stroke="${s.color}" stroke-width="1.5" points="${s.values.map(([t, value]) => `${60 + t / end * 900},${top + 185 - value / panel.max * 160}`).join(' ')}"/>`)
      for (let j = 0; j <= 6; j++) parts.push(`<text x="${60 + j * 150}" y="${top + 205}" font-family="sans-serif" font-size="12">${(end * j / 6).toFixed(0)}s</text>`)
    })
    parts.push('</svg>'); await writeFile(`${dir}/charts.svg`, parts.join('\n'))
  }
  try {
    // Preserve source mappings already obtained with the matching build. Later
    // rebuilds can remove hashed map files and must not erase that evidence.
    if (await readFile(`${dir}/cpu-summary.json`, 'utf8').catch(() => '')) {
      console.log(JSON.stringify({ dir, note: 'Preserved existing CPU source mapping' })); continue
    }
    const cpu = JSON.parse(await readFile(`${dir}/combat.cpuprofile`, 'utf8'))
    const maps = new Map(), groups = new Map(), nodes = new Map(cpu.nodes.map(n => [n.id, n]))
    for (const node of cpu.nodes) {
      const frame = node.callFrame
      let location = `${frame.url}:${frame.lineNumber + 1}:${frame.columnNumber}`
      let name = frame.functionName || '(anonymous)'
      const asset = path.basename(frame.url)
      if (asset.endsWith('.js')) {
        if (!maps.has(asset)) {
          try { maps.set(asset, new TraceMap(JSON.parse(await readFile(`dist/assets/${asset}.map`, 'utf8')))) }
          catch { maps.set(asset, null) }
        }
        if (maps.get(asset)) {
          const original = originalPositionFor(maps.get(asset), { line: frame.lineNumber + 1, column: frame.columnNumber })
          if (original.source) { location = `${original.source}:${original.line}:${original.column}`; name = original.name ?? name }
        }
      }
      node.mapped = { name, location }
    }
    let totalUs = 0
    cpu.samples.forEach((id, i) => {
      const node = nodes.get(id), us = cpu.timeDeltas?.[i] ?? 0
      totalUs += us
      const key = `${node.mapped.name} ${node.mapped.location}`
      const group = groups.get(key) ?? { ...node.mapped, selfUs: 0, samples: 0 }
      group.selfUs += us; group.samples++; groups.set(key, group)
    })
    const subsystemSelfUs = {}
    for (const group of groups.values()) {
      const match = group.location.match(/src\/game\/([^/]+)/)
      const key = match?.[1] ?? (group.location.includes('node_modules') ? 'dependencies' : group.name.startsWith('(') ? group.name : 'unmapped/browser')
      subsystemSelfUs[key] = (subsystemSelfUs[key] ?? 0) + group.selfUs
    }
    await writeFile(`${dir}/cpu-summary.json`, JSON.stringify({ totalUs, subsystemSelfUs,
      selfTime: [...groups.values()].sort((a, b) => b.selfUs - a.selfUs).slice(0, 70) }, null, 2))
    const trace = JSON.parse(await readFile(`${dir}/timeline.json`, 'utf8')), events = {}
    for (const event of trace.traceEvents) {
      const value = events[event.name] ??= { count: 0, durationUs: 0, maxUs: 0 }
      value.count++
      if (event.ph === 'X') { value.durationUs += event.dur ?? 0; value.maxUs = Math.max(value.maxUs, event.dur ?? 0) }
    }
    await writeFile(`${dir}/timeline-summary.json`, JSON.stringify({ warning: 'Durations overlap/nest and span different threads/processes; never sum as total CPU/GPU busy time.',
      events: Object.fromEntries(Object.entries(events).sort((a, b) => b[1].durationUs - a[1].durationUs)) }, null, 2))
  } catch { /* CPU profile is collected only in the separate profiling run. */ }
  console.log(JSON.stringify({ dir, ...summaries[0], entityStats: summaries[0]?.entityStats, intervals: undefined }))
}
