import { serve } from '@hono/node-server'
import { join } from 'node:path'
import { defaultSettings, loadSettings } from './config.js'
import { createApp } from './api/server.js'

async function main() {
  const dataDir = process.env.ORGANIZER_DATA_DIR ?? join(process.env.LOCALAPPDATA ?? '.', 'FileOrganizer')
  const settings = await loadSettings(dataDir)
  const app = createApp({ settings })
  const port = Number(process.env.PORT ?? 8787)
  serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, info => console.log('listening', info.port))
}
void main()
