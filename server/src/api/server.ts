import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import type { Settings } from '../types.js'
import { saveSettings } from '../config.js'
import { insertFiles, insertMoveBatch, insertScanRun, listFiles, listMoveBatch } from '../db.js'
import { scan } from '../scan/scanner.js'
import { planFiles } from '../plan/planner.js'
import { defaultPlannerIo } from '../plan/io.js'
import { executeMoves, undoBatch } from '../exec/batch.js'

export function createApp(ctx: { settings: Settings; db: DatabaseSync; getDataDir: () => string }) {
  const app = new Hono()
  app.get('/api/health', c => c.json({ ok: true }))
  app.get('/api/settings', c => c.json(ctx.settings))
  app.put('/api/settings', async c => {
    const body = await c.req.json() as Partial<Settings>
    const merged = { ...ctx.settings, ...body }
    await saveSettings(merged)
    ctx.settings = merged
    return c.json(merged)
  })
  app.post('/api/scan', c => {
    return streamSSE(c, async stream => {
      const { roots } = await c.req.json() as { roots: string[] }
      const runId = insertScanRun(ctx.db, roots)
      const files = await scan(roots, {
        dataDir: ctx.getDataDir(),
        onProgress: p => void stream.writeSSE({ data: JSON.stringify(p) }),
      })
      insertFiles(ctx.db, runId, files)
      await stream.writeSSE({ data: JSON.stringify({ runId, count: files.length }) })
    })
  })
  app.get('/api/files', c => {
    const runId = Number(c.req.query('runId'))
    const category = c.req.query('category')
    const q = c.req.query('q')?.toLowerCase()
    const rows = listFiles(ctx.db, runId).filter(r =>
      (!category || r.category === category) && (!q || r.path.toLowerCase().includes(q)))
    return c.json(rows)
  })
  app.get('/api/plan', async c => {
    const runId = Number(c.req.query('runId'))
    const files = listFiles(ctx.db, runId)
    const archiveRoot = ctx.settings.archiveRoots[0] ?? join(ctx.getDataDir(), '归档')
    const rows = await planFiles(files, archiveRoot, defaultPlannerIo)
    return c.json({ archiveRoot, rows })
  })
  app.post('/api/execute', async c => {
    const { runId, fileIds } = await c.req.json() as { runId: number; fileIds: number[] }
    const wanted = new Set(fileIds)
    const files = listFiles(ctx.db, runId).filter(f => wanted.has(f.id))
    const archiveRoot = ctx.settings.archiveRoots[0] ?? join(ctx.getDataDir(), '归档')
    const rows = (await planFiles(files, archiveRoot, defaultPlannerIo)).filter(r => r.reason !== 'already-exists')
    const { batchId, log } = await executeMoves(rows)
    insertMoveBatch(ctx.db, batchId, log)
    return c.json({ batchId, log })
  })
  app.post('/api/undo', async c => {
    const { batchId } = await c.req.json() as { batchId: string }
    await undoBatch(listMoveBatch(ctx.db, batchId))
    return c.json({ ok: true })
  })
  return app
}
