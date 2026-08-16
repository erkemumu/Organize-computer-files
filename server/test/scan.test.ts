import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { scan } from '../src/scan/scanner.js'
import { makeFixture } from './fixtures.js'

describe('scan', () => {
  it('walks files, skips Program Files, classifies the rest', async () => {
    const root = mkdtempSync(join(tmpdir(), 'organizer-scan-'))
    makeFixture(root)
    const rows = await scan([root], { dataDir: root, signal: new AbortController().signal })
    const paths = rows.map(r => r.path)
    expect(paths.some(p => p.includes('Program Files'))).toBe(false)
    const jpg = rows.find(r => r.path.endsWith('a.jpg'))!
    expect(jpg.category).toBe('image')
    const pdf = rows.find(r => r.path.endsWith('b.pdf'))!
    expect(pdf.category).toBe('document')
  })
})
