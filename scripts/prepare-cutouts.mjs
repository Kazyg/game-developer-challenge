import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { inflateSync, deflateSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'

// Deterministic native-pixel PNG transform; no browser, GPU or image dependency.
const root = new URL('../', import.meta.url)
const output = new URL('assets/generated/cutouts/', root)
mkdirSync(output, { recursive: true })
function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data])
  const result = Buffer.alloc(body.length + 8)
  result.writeUInt32BE(data.length)
  body.copy(result, 4)
  result.writeUInt32BE(crc32(body), result.length - 4)
  return result
}
function paeth(a, b, c) {
  const p = a + b - c
  const distances = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)]
  return distances[0] <= distances[1] && distances[0] <= distances[2] ? a : distances[1] <= distances[2] ? b : c
}
export function cutout(png) {
  const data = []
  let header
  for (let offset = 8; offset < png.length;) {
    const size = png.readUInt32BE(offset)
    const type = png.toString('ascii', offset + 4, offset + 8)
    const bytes = png.subarray(offset + 8, offset + 8 + size)
    if (type === 'IHDR') header = bytes
    if (type === 'IDAT') data.push(bytes)
    offset += size + 12
  }
  if (!header || header[8] !== 8 || header[9] !== 6 || header[12] !== 0) throw new Error('Expected non-interlaced RGBA8 source PNG')
  const width = header.readUInt32BE(0), height = header.readUInt32BE(4)
  const stride = width * 4
  const raw = inflateSync(Buffer.concat(data))
  const pixels = Buffer.alloc(height * stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    for (let x = 0; x < stride; x++) {
      const left = x >= 4 ? pixels[y * stride + x - 4] : 0
      const above = y ? pixels[(y - 1) * stride + x] : 0
      const corner = y && x >= 4 ? pixels[(y - 1) * stride + x - 4] : 0
      const prediction = [0, left, above, Math.floor((left + above) / 2), paeth(left, above, corner)][filter]
      if (prediction === undefined) throw new Error('Invalid PNG filter')
      pixels[y * stride + x] = (raw[y * (stride + 1) + x + 1] + prediction) & 255
    }
  }
  for (let i = 0; i < pixels.length; i += 4) {
    const [r, g, b] = pixels.subarray(i, i + 3)
    if (Math.floor(i / stride) >= 55 || (g > 155 && r > b) || (g > r && g > b)) pixels[i + 3] = 0
  }
  const scanlines = Buffer.alloc(height * (stride + 1))
  for (let y = 0; y < height; y++) pixels.copy(scanlines, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  return Buffer.concat([png.subarray(0, 8), chunk('IHDR', header), chunk('IDAT', deflateSync(scanlines, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}
export function prepareCutouts(check = false) {
for (const index of [81, 82, 83, 84]) {
  const source = readFileSync(new URL(`assets/png/default/tiles/tile_${index}.png`, root))
  const path = new URL(`tile_${index}.png`, output)
  const generated = cutout(source)
  if (check) {
    if (!readFileSync(path).equals(generated)) throw new Error(`Stale cutout: ${fileURLToPath(path)}`)
  } else writeFileSync(path, generated)
}

}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) prepareCutouts(process.argv.includes('--check'))
