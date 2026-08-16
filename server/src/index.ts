import { serve } from '@hono/node-server'
import { join } from 'node:path'
import { loadSettings } from './config.js'
import { openDb } from './db.js'
import { createApp } from './api/server.js'

async function main() {
  const dataDir = process.env.ORGANIZER_DATA_DIR ?? join(process.env.LOCALAPPDATA ?? '.', 'FileOrganizer')
  const settings = await loadSettings(dataDir)
  const db = openDb(dataDir)
  const app = createApp({ settings, db, getDataDir: () => dataDir })
  const port = Number(process.env.PORT ?? 8787)
  serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, info => console.log('listening', info.port))
}
void main()
