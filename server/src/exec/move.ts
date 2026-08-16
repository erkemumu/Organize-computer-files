import { access, copyFile, mkdir, rename, rm, stat } from 'node:fs/promises'
import { dirname, parse } from 'node:path'
import type { PlanRow, MoveLogRow } from '../types.js'

export function chooseStrategy(from: string, to: string): 'rename' | 'copy-delete' {
  const vol = (p: string) => parse(p).root.toLowerCase()
  return vol(from) === vol(to) ? 'rename' : 'copy-delete'
}

export async function moveOne(row: PlanRow): Promise<MoveLogRow> {
  const base: Omit<MoveLogRow, 'status'|'reason'> = { batchId: '', fileId: row.fileId, from: row.from, to: row.to }
  try {
    await mkdir(dirname(row.to), { recursive: true })
    await access(row.to).then(() => { throw new Error('target already exists') }, () => {})
    if (chooseStrategy(row.from, row.to) === 'rename') {
      await rename(row.from, row.to)
    } else {
      await copyFile(row.from, row.to)
      const a = await stat(row.from); const b = await stat(row.to)
      if (a.size !== b.size) throw new Error('size mismatch after copy')
      await rm(row.from)
    }
    return { ...base, status: 'done' }
  } catch (e) {
    return { ...base, status: 'failed', reason: (e as Error).message }
  }
}
