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
