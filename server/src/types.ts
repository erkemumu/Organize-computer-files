export interface Settings {
  dataDir: string
  scanRoots: string[]
  archiveRoots: string[]
  excludePaths: string[]
  llmEnabled: boolean
  llmApiKey: string
  llmBaseUrl: string
  llmModel: string
}

export type Category = 'image' | 'document' | 'audio' | 'video' | 'other'

export interface FileRecord {
  id: number
  path: string
  size: number
  mtimeMs: number
  ext: string
  category: Category
  labels: string[]
  scanRunId: number
}

export interface MoveLogRow {
  batchId: string
  fileId: number
  from: string
  to: string
  status: 'pending' | 'done' | 'skipped' | 'failed'
  reason?: string
  /** Strategy that was used to perform the move (recorded so undo can replay it). */
  strategy?: 'rename' | 'copy-delete'
}

export interface PlanRow {
  fileId: number
  from: string
  to: string
  reason: 'move' | 'already-exists' | 'conflict-renamed'
  category: Category
  year: number
}
