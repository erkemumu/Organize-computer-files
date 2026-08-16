import { describe, it, expect } from 'vitest'
import { sniffMagic } from '../src/classify/magic.js'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46])

describe('sniffMagic', () => {
  it('recognizes png / jpeg / pdf by signature', () => {
    expect(sniffMagic(PNG)).toBe('png')
    expect(sniffMagic(JPEG)).toBe('jpeg')
    expect(sniffMagic(PDF)).toBe('pdf')
  })
  it('returns unknown for garbage', () => {
    expect(sniffMagic(new Uint8Array([1, 2, 3, 4]))).toBe('unknown')
  })
})
