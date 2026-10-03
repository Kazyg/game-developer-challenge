import { readFile, writeFile } from 'node:fs/promises'

const dir = process.argv[2]
if (!dir) throw new Error('Usage: node scripts/summarize-heaps.mjs <run-directory>')
async function summarize(name) {
  const heap = JSON.parse(await readFile(`${dir}/${name}.heapsnapshot`, 'utf8'))
  const fields = heap.snapshot.meta.node_fields, width = fields.length
  const typeIndex = fields.indexOf('type'), nameIndex = fields.indexOf('name'), sizeIndex = fields.indexOf('self_size')
  const types = heap.snapshot.meta.node_types[typeIndex], groups = new Map()
  for (let offset = 0; offset < heap.nodes.length; offset += width) {
    const key = `${types[heap.nodes[offset + typeIndex]]}:${heap.strings[heap.nodes[offset + nameIndex]]}`
    const group = groups.get(key) ?? { count: 0, bytes: 0 }
    group.count++; group.bytes += heap.nodes[offset + sizeIndex]; groups.set(key, group)
  }
  return groups
}
const before = await summarize('warm-baseline'), after = await summarize('after-five-cycles')
const changes = [...new Set([...before.keys(), ...after.keys()])].map(name => ({ name,
  before: before.get(name) ?? { count: 0, bytes: 0 }, after: after.get(name) ?? { count: 0, bytes: 0 },
  deltaBytes: (after.get(name)?.bytes ?? 0) - (before.get(name)?.bytes ?? 0),
  deltaCount: (after.get(name)?.count ?? 0) - (before.get(name)?.count ?? 0),
})).sort((a, b) => b.deltaBytes - a.deltaBytes)
await writeFile(`${dir}/heap-summary.json`, JSON.stringify({ method: 'Self-size categories; not exhaustive retaining-path analysis. Snapshots trigger GC; compare separately from normal heap samples.',
  totalSelfSizeDelta: changes.reduce((a, c) => a + c.deltaBytes, 0), topGrowth: changes.slice(0, 40), largestReductions: changes.slice(-15) }, null, 2))
console.log(changes.slice(0, 12))
