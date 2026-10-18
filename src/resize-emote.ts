import { parseGIF, decompressFrames, type ParsedFrame } from 'gifuct-js'
import { GIFEncoder, applyPalette, quantize } from 'gifenc'

declare module 'gifenc' {
  interface GifEncoder {
    writeFrame(index: Uint8Array, width: number, height: number, opts?: {
      palette?: number[][]
      delay?: number
      transparent?: boolean
      transparentIndex?: number
      dispose?: number
    }): void
    finish(): void
    bytes(): Uint8Array
  }

  export function GIFEncoder(): GifEncoder
  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    opts?: { format?: string, oneBitAlpha?: boolean | number },
  ): number[][]
  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: number[][],
    format?: string,
  ): Uint8Array
}

const MAX_SOURCE = 512
const MAX_OUTPUT = 64
const MAX_BYTES = 512 * 1024

export type PrepareEmoteResult =
  | { ok: true, file: File }
  | { ok: false, reason: 'type' | 'dimensions' | 'size' }

type RasterKind = 'png' | 'gif'

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
  const blob = kind === 'gif'
    ? await resizeGif(await file.arrayBuffer(), source, target)
    : await resizePng(file, target)

  if (blob.size > MAX_BYTES) {
    return { ok: false, reason: 'size' }
  }

  const type = kind === 'gif' ? 'image/gif' : 'image/png'
  const extension = kind === 'gif' ? '.gif' : '.png'
  const name = file.name.replace(/\.[^.]+$/, '') + extension
  return { ok: true, file: new File([blob], name, { type }) }
}

function fit(width: number, height: number): { width: number, height: number } {
  const scale = MAX_OUTPUT / Math.max(width, height)
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

async function sniff(file: File): Promise<RasterKind | null> {
  const header = new Uint8Array(await file.slice(0, 8).arrayBuffer())
  if (header.length >= 8 && header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47) {
    return 'png'
  }

  const text = String.fromCharCode(...header.subarray(0, 6))
  if (text === 'GIF87a' || text === 'GIF89a') {
    return 'gif'
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

function resizePng(file: File, target: { width: number, height: number }): Promise<Blob> {
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
          reject(new Error('Could not encode PNG'))
        }
      }, 'image/png')
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
