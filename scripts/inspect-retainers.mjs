import { readFile, writeFile } from 'node:fs/promises'
const file = process.argv[2]
if (!file) throw new Error('Usage: node scripts/inspect-retainers.mjs <snapshot>')
const heap = JSON.parse(await readFile(file, 'utf8')), meta = heap.snapshot.meta
const nf = meta.node_fields, ef = meta.edge_fields, nw = nf.length, ew = ef.length
const ni = Object.fromEntries(nf.map((n, i) => [n, i])), ei = Object.fromEntries(ef.map((n, i) => [n, i]))
const types = meta.node_types[ni.type], edgeTypes = meta.edge_types[ei.type], count = heap.nodes.length / nw
const offsets = new Uint32Array(count + 1), parent = new Int32Array(count).fill(-1), parentEdge = new Int32Array(count).fill(-1)
for (let i = 0; i < count; i++) offsets[i + 1] = offsets[i] + heap.nodes[i * nw + ni.edge_count] * ew
const describe = i => `${types[heap.nodes[i * nw + ni.type]]}:${heap.strings[heap.nodes[i * nw + ni.name]]}`
const queue = new Uint32Array(count); let tail = 1; queue[0] = 0; parent[0] = 0
for (let head = 0; head < tail; head++) {
  const from = queue[head]
  for (let e = offsets[from]; e < offsets[from + 1]; e += ew) {
    if (edgeTypes[heap.edges[e + ei.type]] === 'weak') continue
    const to = heap.edges[e + ei.to_node] / nw
    if (parent[to] !== -1) continue
    parent[to] = from; parentEdge[to] = e; queue[tail++] = to
  }
}
const targets = ['native:MessageEvent', 'native:MessagePort', 'native:blink::NetworkResourcesData::ResourceData', 'object:Generator']
const result = {}
const workerPromises = []
for (let from = 0; from < count; from++) for (let e = offsets[from]; e < offsets[from + 1]; e += ew) {
  if (edgeTypes[heap.edges[e + ei.type]] !== 'property' || heap.strings[heap.edges[e + ei.name_or_index]] !== 'workerPromise') continue
  const promise = heap.edges[e + ei.to_node] / nw
  const contents = []
  for (let child = offsets[promise]; child < offsets[promise + 1]; child += ew) {
    const edgeType = edgeTypes[heap.edges[child + ei.type]], label = heap.strings[heap.edges[child + ei.name_or_index]]
    if (edgeType === 'internal' && label === 'reactions_or_result') contents.push(describe(heap.edges[child + ei.to_node] / nw))
  }
  workerPromises.push({ owner: describe(from), promise: describe(promise), reactionsOrResult: contents })
}
for (const target of targets) {
  const indices = []
  for (let i = 0; i < count; i++) if (describe(i) === target && parent[i] !== -1) indices.push(i)
  result[target] = { stronglyReachableCount: indices.length, examples: indices.slice(0, 4).map(i => {
    const path = []
    for (let at = i, depth = 0; at !== 0 && depth < count; at = parent[at], depth++) {
      const e = parentEdge[at], type = edgeTypes[heap.edges[e + ei.type]], name = heap.edges[e + ei.name_or_index]
      path.push({ node: describe(at), via: `${type}:${type === 'element' || type === 'hidden' ? name : heap.strings[name]}` })
    }
    path.reverse()
    return { fullPathLength: path.length, path: path.length > 50 ? [...path.slice(0, 20),
      { omitted: path.length - 40 }, ...path.slice(-20)] : path }
  }) }
}
const output = file.replace(/\.heapsnapshot$/, '-retainers.json')
await writeFile(output, JSON.stringify({ method: 'Shortest root paths excluding weak edges; examples, not full dominator/ephemeron analysis.',
  workerPromises, targets: result }, null, 2))
console.log(output)
