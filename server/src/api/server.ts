import { Hono } from 'hono'
import type { Settings } from '../types.js'

export function createApp(_ctx: { settings: Settings }) {
  const app = new Hono()
  app.get('/api/health', c => c.json({ ok: true }))
  return app
}
