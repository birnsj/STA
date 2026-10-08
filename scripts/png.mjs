// A minimal RGBA PNG encoder and decoder for the placeholder-art scripts (no dependencies: Node's zlib plus a CRC
// table). The decoder reads only what the encoder writes: 8-bit RGBA, not interlaced.
import zlib from 'node:zlib'

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

// data: width * height * 4 bytes, rows top to bottom.
export function encodePng(width, height, data) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 6, 0, 0, 0], 8)
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) raw.set(data.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1)
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  return Buffer.concat([signature, chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

// { width, height, bytes } (width * height * 4 RGBA bytes, rows top to bottom).
export function decodePng(buffer) {
  let offset = 8
  let width = 0
  let height = 0
  const data = []
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const body = buffer.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = body.readUInt32BE(0)
      height = body.readUInt32BE(4)
      if (body[8] !== 8 || body[9] !== 6 || body[12] !== 0) throw new Error('decodePng reads 8-bit RGBA, not interlaced, only')
    } else if (type === 'IDAT') data.push(body)
    offset += 12 + length
  }
  const raw = zlib.inflateSync(Buffer.concat(data))
  const stride = width * 4
  const bytes = new Uint8Array(stride * height)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let i = 0; i < stride; i++) {
      const left = i >= 4 ? bytes[y * stride + i - 4] : 0
      const up = y > 0 ? bytes[(y - 1) * stride + i] : 0
      const corner = i >= 4 && y > 0 ? bytes[(y - 1) * stride + i - 4] : 0
      let predictor = 0
      if (filter === 1) predictor = left
      else if (filter === 2) predictor = up
      else if (filter === 3) predictor = (left + up) >> 1
      else if (filter === 4) {
        const p = left + up - corner
        const pa = Math.abs(p - left)
        const pb = Math.abs(p - up)
        const pc = Math.abs(p - corner)
        predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : corner
      }
      bytes[y * stride + i] = (line[i] + predictor) & 255
    }
  }
  return { width, height, bytes }
}
