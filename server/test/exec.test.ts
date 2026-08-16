import { describe, it, expect } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join, parse } from 'node:path'
import { tmpdir } from 'node:os'
import { chooseStrategy, moveOne } from '../src/exec/move.js'
import { undoBatch } from '../src/exec/batch.js'
import type { PlanRow } from '../src/types.js'

describe('chooseStrategy', () => {
  it('renames on same volume, copies across volumes', () => {
    expect(chooseStrategy('C:/a/x.jpg', 'C:/b/y.jpg')).toBe('rename')
    expect(chooseStrategy('C:/a/x.jpg', 'D:/b/y.jpg')).toBe('copy-delete')
  })
})

describe('cross-volume undo', () => {
  // Pick a sibling of os.tmpdir() on a *different* volume root so that
  // chooseStrategy returns 'copy-delete'. os.tmpdir() resolves to whatever
  // $TMP/$TEMP points at (commonly %LOCALAPPDATA%\Temp on C:); the cwd lives
  // on the workspace drive. We scan process.cwd() to learn the cwd volume,
  // then construct a source root on that drive and a destination root under
  // os.tmpdir() (the other volume). Falls back to a self-skip if only one
  // volume is reachable on the host.
  function pickCrossVolumeRoots(): { srcRoot: string; dstRoot: string } | null {
    const cwdRoot = parse(process.cwd()).root // e.g. 'D:\\'
    const tmpRoot = parse(tmpdir()).root // e.g. 'C:\\'
    if (cwdRoot.toLowerCase() === tmpRoot.toLowerCase()) return null
    return {
      srcRoot: join(cwdRoot, 'Temp-organizer-src-' + Date.now()),
      dstRoot: join(tmpRoot, 'Temp-organizer-dst-' + Date.now()),
    }
  }

  it('records strategy on success and undoes a cross-volume move', async () => {
    const roots = pickCrossVolumeRoots()
    if (!roots) {
      // Single-volume CI host — skip rather than fabricate a fake cross-volume.
      return
    }
    mkdirSync(roots.srcRoot, { recursive: true })
    mkdirSync(roots.dstRoot, { recursive: true })
    const src = mkdtempSync(join(roots.srcRoot, 'src-'))
    const dst = mkdtempSync(join(roots.dstRoot, 'dst-'))
    try {
      // Sanity-check: parse().root must differ for the chosen roots.
      expect(parse(src).root.toLowerCase()).not.toBe(parse(dst).root.toLowerCase())
      const from = join(src, 'file.txt')
      const to = join(dst, 'file.txt')
      const payload = Buffer.from('hello-cross-volume-' + Date.now())
      writeFileSync(from, payload)
      const row: PlanRow = { fileId: 1, from, to, reason: 'move', category: 'document', year: 2026 }
      const log = [await moveOne(row)]
      expect(log[0].status).toBe('done')
      expect(log[0].strategy).toBe('copy-delete')
      expect(existsSync(from)).toBe(false)
      expect(existsSync(to)).toBe(true)
      await undoBatch(log)
      expect(existsSync(to)).toBe(false)
      expect(existsSync(from)).toBe(true)
      expect(readFileSync(from).equals(payload)).toBe(true)
    } finally {
      rmSync(src, { recursive: true, force: true })
      rmSync(dst, { recursive: true, force: true })
      rmSync(roots.srcRoot, { recursive: true, force: true })
      rmSync(roots.dstRoot, { recursive: true, force: true })
    }
  })
})
