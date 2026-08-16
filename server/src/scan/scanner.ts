import { readdir, readFile, stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { join } from 'node:path'
import type { FileRecord } from '../types.js'
import { isAppDir, isHardSkipName } from './rules.js'
import { classifyLocal } from '../classify/local.js'
import { sniffMagic } from '../classify/magic.js'

const HEAD_BYTES = 16

export async function scan(roots: string[], opts: { dataDir: string; signal?: AbortSignal; onProgress?: (p: { done: number; total: number }) => void }): Promise<FileRecord[]> {
  const out: FileRecord[] = []
  for (const root of roots) {
    await walk(root, out, opts)
  }
  return out
}

async function walk(dir: string, out: FileRecord[], opts: { signal?: AbortSignal; onProgress?: (p: { done: number; total: number }) => void }): Promise<void> {
  opts.signal?.throwIfAborted()
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const names = entries.map(e => e.name)
  if (isAppDir(names)) return
  for (const entry of entries) {
    opts.signal?.throwIfAborted()
    if (entry.isDirectory()) {
      if (isHardSkipName(entry.name)) continue
      await walk(join(dir, entry.name), out, opts)
    } else if (entry.isFile()) {
      const path = join(dir, entry.name)
      const st = await stat(path).catch(() => null)
      if (!st) continue
      const ext = (entry.name.match(/\.[^.]+$/) ?? [''])[0].slice(1).toLowerCase()
      const fh = await new Promise<Buffer | undefined>(resolve => {
        const chunks: Buffer[] = []
        const stream = createReadStream(path, { start: 0, end: HEAD_BYTES - 1 })
        stream.on('data', (c: Buffer | string) => { chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)) })
        stream.on('end', () => resolve(Buffer.concat(chunks)))
        stream.on('error', () => resolve(undefined))
      })
      const magic = fh ? sniffMagic(new Uint8Array(fh)) : 'unknown'
      out.push({ id: 0, path, size: st.size, mtimeMs: st.mtimeMs, ext, category: classifyLocal({ path, ext, magic }), labels: [], scanRunId: 0 })
      opts.onProgress?.({ done: out.length, total: -1 })
    }
  }
}
