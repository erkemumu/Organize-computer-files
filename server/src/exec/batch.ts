import { randomUUID } from 'node:crypto'
import { mkdir, rename } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { MoveLogRow, PlanRow } from '../types.js'
import { moveOne } from './move.js'

export async function executeMoves(rows: PlanRow[]): Promise<{ batchId: string; log: MoveLogRow[] }> {
  const batchId = randomUUID()
  const log: MoveLogRow[] = []
  for (const r of rows) { const l = await moveOne(r); l.batchId = batchId; log.push(l) }
  return { batchId, log }
}

export async function undoBatch(log: MoveLogRow[]): Promise<void> {
  for (const l of [...log].reverse()) {
    if (l.status !== 'done') continue
    await mkdir(dirname(l.from), { recursive: true })
    await rename(l.to, l.from)
  }
}
