import { describe, it, expect } from 'vitest'
import { sniffMagic } from '../src/classify/magic.js'
import { classifyLocal } from '../src/classify/local.js'

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

describe('classifyLocal', () => {
  it('maps extensions to coarse categories', () => {
    expect(classifyLocal({ path: 'a.jpg', ext: 'jpg', magic: 'jpeg' })).toBe('image')
    expect(classifyLocal({ path: 'a.pdf', ext: 'pdf', magic: 'pdf' })).toBe('document')
    expect(classifyLocal({ path: 'a.docx', ext: 'docx', magic: 'zip' })).toBe('document')
    expect(classifyLocal({ path: 'a.mp3', ext: 'mp3', magic: 'unknown' })).toBe('audio')
    expect(classifyLocal({ path: 'a.mkv', ext: 'mkv', magic: 'unknown' })).toBe('video')
  })
  it('trusts magic over a lying extension', () => {
    expect(classifyLocal({ path: 'fake.txt', ext: 'txt', magic: 'jpeg' })).toBe('image')
  })
})
