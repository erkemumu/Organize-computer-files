import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { insertFiles, insertScanRun, listFiles, openDb } from '../src/db.js'

describe('db', () => {
  it('round-trips files for a scan run', () => {
    const dir = mkdtempSync(join(tmpdir(), 'organizer-db-'))
    const db = openDb(dir)
    const runId = insertScanRun(db, ['/tmp/x'])
    insertFiles(db, runId, [{ id: 0, path: '/tmp/x/a.jpg', size: 3, mtimeMs: 1, ext: 'jpg', category: 'image', labels: [], scanRunId: runId }])
    const rows = listFiles(db, runId)
    expect(rows).toHaveLength(1)
    expect(rows[0].category).toBe('image')
  })
})
