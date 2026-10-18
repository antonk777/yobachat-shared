import { renderSVG } from 'uqr'

const kHttpUrl = /^https?:\/\/\S+$/i

/** SVG data URL for a stored http(s) link. Empty when the value cannot be encoded. */
export function qrImageSrc(value: string | undefined): string {
  if (!value || value.length > 2048 || !kHttpUrl.test(value)) {
    return ''
  }

  try {
    const svg = renderSVG(value, {
      ecc: 'M',
      border: 2,
      pixelSize: 8,
      blackColor: '#000000',
      whiteColor: '#ffffff',
    })

    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  } catch {
    return ''
  }
}
