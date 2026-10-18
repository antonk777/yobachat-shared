/// <reference path="./gifenc.d.ts" />
import { parseGIF, decompressFrames, type ParsedFrame } from 'gifuct-js'
import { GIFEncoder, applyPalette, quantize } from 'gifenc'

const MAX_SOURCE = 512
const MAX_OUTPUT = 64
const MAX_BYTES = 512 * 1024

export type PrepareEmoteResult =
  | { ok: true, file: File }
  | { ok: false, reason: 'type' | 'dimensions' | 'size' }

type RasterKind = 'png' | 'gif' | 'webp'

export async function prepareEmoteFile(file: File): Promise<PrepareEmoteResult> {
  const kind = await sniff(file)
  if (!kind) {
    return { ok: false, reason: 'type' }
  }

  const source = await measure(file)
  if (!source) {
    return { ok: false, reason: 'type' }
  }

  if (source.width > MAX_SOURCE || source.height > MAX_SOURCE || source.width < 1 || source.height < 1) {
    return { ok: false, reason: 'dimensions' }
  }

  if (source.width <= MAX_OUTPUT && source.height <= MAX_OUTPUT) {
    return file.size > MAX_BYTES
      ? { ok: false, reason: 'size' }
      : { ok: true, file }
  }

  const target = fit(source.width, source.height)
  const resized = await resizeToFit(kind, file, source, target)

  if (resized.blob.size > MAX_BYTES) {
    return { ok: false, reason: 'size' }
  }

  const name = file.name.replace(/\.[^.]+$/, '') + resized.extension
  return { ok: true, file: new File([resized.blob], name, { type: resized.type }) }
}

async function resizeToFit(
  kind: RasterKind,
  file: File,
  source: { width: number, height: number },
  target: { width: number, height: number },
): Promise<{ blob: Blob, type: string, extension: string }> {
  if (kind === 'gif') {
    return {
      blob: await resizeGif(await file.arrayBuffer(), source, target),
      type: 'image/gif',
      extension: '.gif',
    }
  }

  if (kind === 'webp') {
    return {
      blob: await resizeWebp(file, target),
      type: 'image/webp',
      extension: '.webp',
    }
  }

  return {
    blob: await resizeStill(file, target, 'png'),
    type: 'image/png',
    extension: '.png',
  }
}

function fit(width: number, height: number): { width: number, height: number } {
  const scale = MAX_OUTPUT / Math.max(width, height)
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

async function sniff(file: File): Promise<RasterKind | null> {
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  if (header.length >= 8 && header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47) {
    return 'png'
  }

  const text = String.fromCharCode(...header.subarray(0, 6))
  if (text === 'GIF87a' || text === 'GIF89a') {
    return 'gif'
  }

  if (
    header.length >= 12
    && header[0] === 0x52
    && header[1] === 0x49
    && header[2] === 0x46
    && header[3] === 0x46
    && header[8] === 0x57
    && header[9] === 0x45
    && header[10] === 0x42
    && header[11] === 0x50
  ) {
    return 'webp'
  }

  return null
}

function measure(file: File): Promise<{ width: number, height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight })
      URL.revokeObjectURL(url)
    }
    image.onerror = () => {
      resolve(null)
      URL.revokeObjectURL(url)
    }
    image.src = url
  })
}

function resizeStill(file: File, target: { width: number, height: number }, kind: 'png' | 'webp'): Promise<Blob> {
  const mime = kind === 'webp' ? 'image/webp' : 'image/png'
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')
      canvas.width = target.width
      canvas.height = target.height
      const context = canvas.getContext('2d')
      if (!context) {
        reject(new Error('Canvas is not available'))
        return
      }

      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'
      context.drawImage(image, 0, 0, target.width, target.height)
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob)
        } else {
          reject(new Error('Could not encode image'))
        }
      }, mime)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read image'))
    }
    image.src = url
  })
}

async function resizeGif(
  buffer: ArrayBuffer,
  source: { width: number, height: number },
  target: { width: number, height: number },
): Promise<Blob> {
  const parsed = parseGIF(buffer)
  const frames = decompressFrames(parsed, true)
  if (frames.length === 0) {
    throw new Error('GIF has no frames')
  }

  const composed = composeFrames(frames, source.width, source.height)
  const encoder = GIFEncoder()

  for (const frame of composed) {
    const rgba = scaleFrame(frame.pixels, source, target)
    const palette = quantize(rgba, 256, { format: 'rgba4444', oneBitAlpha: 127 })
    const index = applyPalette(rgba, palette, 'rgba4444')
    const transparentIndex = palette.findIndex(color => (color[3] ?? 255) === 0)
    encoder.writeFrame(index, target.width, target.height, {
      palette,
      delay: frame.delay,
      transparent: transparentIndex >= 0,
      transparentIndex: transparentIndex >= 0 ? transparentIndex : 0,
      dispose: 1,
    })
  }

  encoder.finish()
  const bytes = encoder.bytes()
  return new Blob([Uint8Array.from(bytes)], { type: 'image/gif' })
}

function composeFrames(
  frames: ParsedFrame[],
  width: number,
  height: number,
): { pixels: ImageData, delay: number }[] {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    throw new Error('Canvas is not available')
  }

  const output: { pixels: ImageData, delay: number }[] = []
  let restore: ImageData | null = null

  for (const frame of frames) {
    if (frame.disposalType === 3) {
      restore = context.getImageData(0, 0, width, height)
    }

    const patch = document.createElement('canvas')
    patch.width = frame.dims.width
    patch.height = frame.dims.height
    const patchContext = patch.getContext('2d')
    if (!patchContext) {
      throw new Error('Canvas is not available')
    }

    const patchData = patchContext.createImageData(frame.dims.width, frame.dims.height)
    patchData.data.set(frame.patch)
    patchContext.putImageData(patchData, 0, 0)
    context.drawImage(patch, frame.dims.left, frame.dims.top)

    output.push({
      pixels: context.getImageData(0, 0, width, height),
      delay: Math.max(frame.delay || 100, 20),
    })

    if (frame.disposalType === 2) {
      context.clearRect(frame.dims.left, frame.dims.top, frame.dims.width, frame.dims.height)
    } else if (frame.disposalType === 3 && restore) {
      context.putImageData(restore, 0, 0)
    }
  }

  return output
}

function scaleFrame(
  pixels: ImageData,
  source: { width: number, height: number },
  target: { width: number, height: number },
): Uint8ClampedArray {
  const sourceCanvas = document.createElement('canvas')
  sourceCanvas.width = source.width
  sourceCanvas.height = source.height
  const sourceContext = sourceCanvas.getContext('2d')
  if (!sourceContext) {
    throw new Error('Canvas is not available')
  }

  sourceContext.putImageData(pixels, 0, 0)
  const targetCanvas = document.createElement('canvas')
  targetCanvas.width = target.width
  targetCanvas.height = target.height
  const targetContext = targetCanvas.getContext('2d')
  if (!targetContext) {
    throw new Error('Canvas is not available')
  }

  targetContext.imageSmoothingEnabled = true
  targetContext.imageSmoothingQuality = 'high'
  targetContext.drawImage(sourceCanvas, 0, 0, target.width, target.height)
  return targetContext.getImageData(0, 0, target.width, target.height).data
}

interface RgbaColor {
  r: number
  g: number
  b: number
  a: number
}

interface WebpChunk {
  tag: string
  data: Uint8Array
}

interface WebpFrame {
  x: number
  y: number
  width: number
  height: number
  duration: number
  overwrite: boolean
  disposeToBackground: boolean
  chunks: WebpChunk[]
}

interface WebpAnimation {
  width: number
  height: number
  loopCount: number
  background: RgbaColor
  frames: WebpFrame[]
}

/** A still WebP is scaled as one image. An animated WebP keeps every frame. */
async function resizeWebp(
  file: File,
  target: { width: number, height: number },
): Promise<Blob> {
  const animation = parseAnimatedWebp(new Uint8Array(await file.arrayBuffer()))
  if (!animation) {
    return resizeStill(file, target, 'webp')
  }

  const composed = await composeWebpFrames(animation)
  const frames = composed.map(frame => ({
    rgba: scaleFrame(frame.pixels, { width: animation.width, height: animation.height }, target),
    duration: frame.duration,
  }))
  const bytes = await encodeAnimatedWebp(frames, target, animation.loopCount, animation.background)
  return new Blob([Uint8Array.from(bytes)], { type: 'image/webp' })
}

function parseAnimatedWebp(data: Uint8Array): WebpAnimation | null {
  if (ascii(data, 0, 4) !== 'RIFF' || ascii(data, 8, 4) !== 'WEBP') {
    return null
  }

  const chunks = readChunks(data, 12, data.length)
  const vp8x = chunks.find(chunk => chunk.tag === 'VP8X')
  if (!vp8x || vp8x.data.length < 10 || (vp8x.data[0] & 0x02) === 0) {
    return null
  }

  const anim = chunks.find(chunk => chunk.tag === 'ANIM')
  if (!anim || anim.data.length < 6) {
    return null
  }

  const frames = chunks.filter(chunk => chunk.tag === 'ANMF').map(parseAnmf).filter(frame => frame.width > 0 && frame.height > 0)
  if (frames.length === 0) {
    return null
  }

  return {
    width: 1 + readU24(vp8x.data, 4),
    height: 1 + readU24(vp8x.data, 7),
    loopCount: anim.data[4] | (anim.data[5] << 8),
    background: { b: anim.data[0], g: anim.data[1], r: anim.data[2], a: anim.data[3] },
    frames,
  }
}

function parseAnmf(chunk: WebpChunk): WebpFrame {
  const flags = chunk.data[15] ?? 0
  return {
    x: readU24(chunk.data, 0) * 2,
    y: readU24(chunk.data, 3) * 2,
    width: 1 + readU24(chunk.data, 6),
    height: 1 + readU24(chunk.data, 9),
    duration: readU24(chunk.data, 12),
    overwrite: (flags & 0x02) !== 0,
    disposeToBackground: (flags & 0x01) !== 0,
    chunks: readChunks(chunk.data, 16, chunk.data.length),
  }
}

async function composeWebpFrames(animation: WebpAnimation): Promise<{ pixels: ImageData, duration: number }[]> {
  const canvas = document.createElement('canvas')
  canvas.width = animation.width
  canvas.height = animation.height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    throw new Error('Canvas is not available')
  }

  fillBackground(context, 0, 0, animation.width, animation.height, animation.background)
  const output: { pixels: ImageData, duration: number }[] = []

  for (const frame of animation.frames) {
    const decoded = await decodeWebpFrame(frame)
    try {
      if (frame.overwrite) {
        context.clearRect(frame.x, frame.y, frame.width, frame.height)
      }

      context.drawImage(decoded.image, frame.x, frame.y, frame.width, frame.height)
    } finally {
      URL.revokeObjectURL(decoded.url)
    }
    output.push({
      pixels: context.getImageData(0, 0, animation.width, animation.height),
      duration: Math.max(frame.duration || 100, 20),
    })

    if (frame.disposeToBackground) {
      fillBackground(context, frame.x, frame.y, frame.width, frame.height, animation.background)
    }
  }

  return output
}

function fillBackground(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: RgbaColor,
): void {
  context.clearRect(x, y, width, height)
  if (color.a === 0) {
    return
  }

  context.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a / 255})`
  context.fillRect(x, y, width, height)
}

async function decodeWebpFrame(frame: WebpFrame): Promise<{ image: HTMLImageElement, url: string }> {
  const bytes = standaloneWebp(frame)
  const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type: 'image/webp' }))
  try {
    return { image: await loadImage(url), url }
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
}

function standaloneWebp(frame: WebpFrame): Uint8Array {
  const alpha = frame.chunks.find(chunk => chunk.tag === 'ALPH')
  const lossless = frame.chunks.find(chunk => chunk.tag === 'VP8L')
  const lossy = frame.chunks.find(chunk => chunk.tag === 'VP8 ')
  if (lossless) {
    return riffWebp([chunkBytes('VP8L', lossless.data)])
  }

  if (!lossy) {
    throw new Error('WebP frame has no image')
  }

  if (!alpha) {
    return riffWebp([chunkBytes('VP8 ', lossy.data)])
  }

  const extended = new Uint8Array(10)
  extended[0] = 0x10
  writeU24(extended, 4, frame.width - 1)
  writeU24(extended, 7, frame.height - 1)
  return riffWebp([
    chunkBytes('VP8X', extended),
    chunkBytes('ALPH', alpha.data),
    chunkBytes('VP8 ', lossy.data),
  ])
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not read WebP frame'))
    image.src = url
  })
}

async function encodeAnimatedWebp(
  frames: { rgba: Uint8ClampedArray, duration: number }[],
  target: { width: number, height: number },
  loopCount: number,
  background: RgbaColor,
): Promise<Uint8Array> {
  const encoded: Uint8Array[] = []
  let hasAlpha = false

  for (const frame of frames) {
    if (!hasAlpha) {
      for (let index = 3; index < frame.rgba.length; index += 4) {
        if (frame.rgba[index] !== 255) {
          hasAlpha = true
          break
        }
      }
    }

    const still = await encodeStillWebp(frame.rgba, target)
    encoded.push(anmfChunk(imageChunks(still), target, frame.duration))
  }

  const extended = new Uint8Array(10)
  extended[0] = 0x02 | (hasAlpha ? 0x10 : 0)
  writeU24(extended, 4, target.width - 1)
  writeU24(extended, 7, target.height - 1)

  const anim = new Uint8Array(6)
  anim[0] = background.b
  anim[1] = background.g
  anim[2] = background.r
  anim[3] = background.a
  anim[4] = loopCount & 255
  anim[5] = (loopCount >> 8) & 255

  return riffWebp([chunkBytes('VP8X', extended), chunkBytes('ANIM', anim), ...encoded])
}

function anmfChunk(chunks: Uint8Array[], size: { width: number, height: number }, duration: number): Uint8Array {
  const header = new Uint8Array(16)
  writeU24(header, 6, size.width - 1)
  writeU24(header, 9, size.height - 1)
  writeU24(header, 12, Math.min(duration, 0xffffff))
  header[15] = 0x02
  return chunkBytes('ANMF', concat([header, ...chunks]))
}

function encodeStillWebp(rgba: Uint8ClampedArray, size: { width: number, height: number }): Promise<Uint8Array> {
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const context = canvas.getContext('2d')
  if (!context) {
    return Promise.reject(new Error('Canvas is not available'))
  }

  context.putImageData(new ImageData(new Uint8ClampedArray(rgba), size.width, size.height), 0, 0)
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        reject(new Error('Could not encode WebP'))
        return
      }

      resolve(new Uint8Array(await blob.arrayBuffer()))
    }, 'image/webp')
  })
}

function imageChunks(file: Uint8Array): Uint8Array[] {
  const chunks = readChunks(file, 12, file.length).filter(chunk => chunk.tag === 'ALPH' || chunk.tag === 'VP8 ' || chunk.tag === 'VP8L')
  if (!chunks.some(chunk => chunk.tag === 'VP8 ' || chunk.tag === 'VP8L')) {
    throw new Error('Could not encode WebP')
  }

  return chunks
    .sort((left, right) => Number(left.tag !== 'ALPH') - Number(right.tag !== 'ALPH'))
    .map(chunk => chunkBytes(chunk.tag, chunk.data))
}

function readChunks(data: Uint8Array, start: number, end: number): WebpChunk[] {
  const chunks: WebpChunk[] = []
  let offset = start
  while (offset + 8 <= end) {
    const size = readU32(data, offset + 4)
    const payloadEnd = offset + 8 + size
    if (payloadEnd > end) {
      break
    }

    chunks.push({ tag: ascii(data, offset, 4), data: data.subarray(offset + 8, payloadEnd) })
    offset = payloadEnd + (size % 2)
  }

  return chunks
}

function chunkBytes(tag: string, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + payload.length + (payload.length % 2))
  out.set(asciiBytes(tag), 0)
  writeU32(out, 4, payload.length)
  out.set(payload, 8)
  return out
}

function riffWebp(parts: Uint8Array[]): Uint8Array {
  const body = concat(parts)
  const out = new Uint8Array(12 + body.length)
  out.set(asciiBytes('RIFF'), 0)
  writeU32(out, 4, body.length + 4)
  out.set(asciiBytes('WEBP'), 8)
  out.set(body, 12)
  return out
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }

  return out
}

function ascii(data: Uint8Array, offset: number, length: number): string {
  let text = ''
  for (let index = 0; index < length; index++) {
    text += String.fromCharCode(data[offset + index] ?? 0)
  }

  return text
}

function asciiBytes(text: string): Uint8Array {
  return Uint8Array.from(text, char => char.charCodeAt(0))
}

function readU24(data: Uint8Array, offset: number): number {
  return (data[offset] ?? 0) | ((data[offset + 1] ?? 0) << 8) | ((data[offset + 2] ?? 0) << 16)
}

function readU32(data: Uint8Array, offset: number): number {
  return readU24(data, offset) | ((data[offset + 3] ?? 0) << 24)
}

function writeU24(data: Uint8Array, offset: number, value: number): void {
  data[offset] = value & 255
  data[offset + 1] = (value >> 8) & 255
  data[offset + 2] = (value >> 16) & 255
}

function writeU32(data: Uint8Array, offset: number, value: number): void {
  writeU24(data, offset, value)
  data[offset + 3] = (value >> 24) & 255
}
