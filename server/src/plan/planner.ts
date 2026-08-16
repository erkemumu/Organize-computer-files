import type { FileRecord, PlanRow } from '../types.js'
import { buildTargetPath } from './paths.js'

export interface PlannerIo {
  hashOf: (path: string) => Promise<string>
  exists: (path: string) => Promise<boolean>
}

export async function planFiles(files: FileRecord[], archiveRoot: string, io: PlannerIo): Promise<PlanRow[]> {
  const rows: PlanRow[] = []
  const planned = new Set<string>()
  for (const f of files) {
    const year = new Date(f.mtimeMs).getFullYear()
    const filename = f.path.split(/[\\/]/).pop()!
    const base = buildTargetPath(archiveRoot, f.category, year, filename)
    const myHash = await io.hashOf(f.path)
    let dest = base
    let reason: PlanRow['reason']
    if (await io.exists(base)) {
      if ((await io.hashOf(base)) === myHash) {
        reason = 'already-exists'
      } else {
        dest = nextFree(base, planned)
        reason = 'conflict-renamed'
      }
    } else {
      reason = 'move'
    }
    planned.add(dest)
    rows.push({ fileId: f.id, from: f.path, to: dest, reason, category: f.category, year })
  }
  return rows
}

function nextFree(base: string, planned: Set<string>): string {
  const dot = base.lastIndexOf('.')
  const slash = Math.max(base.lastIndexOf('/'), base.lastIndexOf('\\'))
  const stem = dot > slash ? base.slice(0, dot) : base
  const ext = dot > slash ? base.slice(dot) : ''
  for (let n = 1; ; n++) {
    const candidate = stem + ' (' + n + ')' + ext
    if (!planned.has(candidate)) return candidate
  }
}
