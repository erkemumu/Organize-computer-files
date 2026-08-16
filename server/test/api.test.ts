import { describe, it, expect } from 'vitest'
import { serve } from '@hono/node-server'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { defaultSettings } from '../src/config.js'
import { openDb } from '../src/db.js'
import { createApp } from '../src/api/server.js'
import type { Server } from 'node:http'

async function boot(dataDir: string): Promise<{ base: string; close: () => void }> {
  const app = createApp({ settings: defaultSettings(dataDir), db: openDb(dataDir), getDataDir: () => dataDir })
  const server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' }) as unknown as Server
  await new Promise<void>(r => server.on('listening', () => r()))
  const port = (server.address() as { port: number }).port
  return { base: `http://127.0.0.1:${port}`, close: () => server.close() }
}

describe('api', () => {
  it('serves health and settings round-trip', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'organizer-api-'))
    const { base, close } = await boot(dir)
    const health = await fetch(`${base}/api/health`)
    expect((await health.json()).ok).toBe(true)
    await fetch(`${base}/api/settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ llmEnabled: true }) })
    const s = await (await fetch(`${base}/api/settings`)).json() as { llmEnabled: boolean }
    expect(s.llmEnabled).toBe(true)
    close()
  })
})
