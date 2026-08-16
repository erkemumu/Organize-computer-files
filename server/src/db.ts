import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { FileRecord, MoveLogRow } from './types.js'

export function openDb(dataDir: string): DatabaseSync {
  mkdirSync(dataDir, { recursive: true })
  const db = new DatabaseSync(join(dataDir, 'organizer.db'))
  db.exec(`
    CREATE TABLE IF NOT EXISTS scan_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, roots TEXT, created_at INTEGER);
    CREATE TABLE IF NOT EXISTS files (id INTEGER PRIMARY KEY AUTOINCREMENT, scan_run_id INTEGER, path TEXT UNIQUE, size INTEGER, mtime_ms INTEGER, ext TEXT, category TEXT, labels TEXT);
    CREATE TABLE IF NOT EXISTS move_batches (batch_id TEXT, file_id INTEGER, from_path TEXT, to_path TEXT, status TEXT, reason TEXT);
  `)
  return db
}
export function insertScanRun(db: DatabaseSync, roots: string[]): number {
  const r = db.prepare('INSERT INTO scan_runs (roots, created_at) VALUES (?, ?)').run(JSON.stringify(roots), Date.now())
  return Number(r.lastInsertRowid)
}
export function insertFiles(db: DatabaseSync, runId: number, files: FileRecord[]): void {
  const st = db.prepare('INSERT OR REPLACE INTO files (scan_run_id, path, size, mtime_ms, ext, category, labels) VALUES (?,?,?,?,?,?,?)')
  for (const f of files) st.run(runId, f.path, f.size, f.mtimeMs, f.ext, f.category, JSON.stringify(f.labels))
}
export function listFiles(db: DatabaseSync, runId: number): FileRecord[] {
  const rows = db.prepare('SELECT * FROM files WHERE scan_run_id = ?').all(runId) as any[]
  return rows.map(r => ({ id: r.id, path: r.path, size: r.size, mtimeMs: r.mtime_ms, ext: r.ext, category: r.category, labels: JSON.parse(r.labels), scanRunId: r.scan_run_id }))
}
export function insertMoveBatch(db: DatabaseSync, batchId: string, rows: MoveLogRow[]): void {
  const st = db.prepare('INSERT INTO move_batches (batch_id, file_id, from_path, to_path, status, reason) VALUES (?,?,?,?,?,?)')
  for (const r of rows) st.run(batchId, r.fileId, r.from, r.to, r.status, r.reason ?? null)
}
export function listMoveBatch(db: DatabaseSync, batchId: string): MoveLogRow[] {
  const rows = db.prepare('SELECT * FROM move_batches WHERE batch_id = ?').all(batchId) as any[]
  return rows.map(r => ({ batchId: r.batch_id, fileId: r.file_id, from: r.from_path, to: r.to_path, status: r.status, reason: r.reason }))
}
