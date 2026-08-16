const ascii = (b: Uint8Array, o: number, s: number) => String.fromCharCode(...b.slice(o, o + s))
export function sniffMagic(bytes: Uint8Array): string {
  if (bytes.length >= 8 && ascii(bytes, 0, 8) === '\x89PNG\r\n\x1a\n') return 'png'
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg'
  if (ascii(bytes, 0, 4) === '%PDF') return 'pdf'
  if (ascii(bytes, 0, 4) === 'PK\x03\x04') return 'zip'
  if (ascii(bytes, 0, 8) === '\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1') return 'ole'
  if (ascii(bytes, 0, 4) === 'OggS') return 'ogg'
  if (bytes.length >= 12 && ascii(bytes, 4, 4) === 'ftyp') return 'mp4'
  if (ascii(bytes, 0, 3) === 'GIF') return 'gif'
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'webp'
  return 'unknown'
}
