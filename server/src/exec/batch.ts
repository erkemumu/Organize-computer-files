import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, rename, rm, stat } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { MoveLogRow, PlanRow } from '../types.js'
import { chooseStrategy, moveOne } from './move.js'

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
    // Replay the same strategy that the original move used; fall back to deriving
    // from from/to for older log rows that pre-date the strategy field.
    const strategy = l.strategy ?? chooseStrategy(l.from, l.to)
    if (strategy === 'rename') {
      await rename(l.to, l.from)
    } else {
      await copyFile(l.to, l.from)
      const a = await stat(l.to); const b = await stat(l.from)
      if (a.size !== b.size) throw new Error('size mismatch after undo copy')
      await rm(l.to)
    }
  }
}
