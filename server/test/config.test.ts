import { describe, it, expect } from 'vitest'
import { mkdtempSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { defaultSettings, loadSettings, saveSettings } from '../src/config.js'

describe('config', () => {
  it('returns defaults and round-trips overrides', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'organizer-cfg-'))
    const d = defaultSettings(dir)
    expect(d.dataDir).toBe(dir)
    expect(d.archiveRoots).toEqual([])
    d.archiveRoots = [join(dir, '归档')]
    d.llmEnabled = true
    await saveSettings(d)
    const loaded = await loadSettings(dir)
    expect(loaded.archiveRoots).toEqual([join(dir, '归档')])
    expect(loaded.llmEnabled).toBe(true)
  })
})
