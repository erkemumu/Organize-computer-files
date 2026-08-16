import { describe, it, expect } from 'vitest'
import { HARD_SKIP_DIRS, isHardSkipName, isAppDir } from '../src/scan/rules.js'

describe('scan rules', () => {
  it('hard-skips system and vcs names', () => {
    for (const n of ['Windows', 'Program Files', 'AppData', 'node_modules', '.git', '$Recycle.Bin'])
      expect(isHardSkipName(n)).toBe(true)
    expect(isHardSkipName('MyPhotos')).toBe(false)
  })
  it('detects an application directory by executable presence', () => {
    expect(isAppDir(['app.exe', 'app.dll', 'config.ini'])).toBe(true)
    expect(isAppDir(['vacation.jpg', 'notes.pdf'])).toBe(false)
  })
})
