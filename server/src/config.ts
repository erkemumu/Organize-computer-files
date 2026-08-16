import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Settings } from './types.js'

export function defaultSettings(dataDir: string): Settings {
  return {
    dataDir, scanRoots: [], archiveRoots: [], excludePaths: [],
    llmEnabled: false, llmApiKey: '', llmBaseUrl: 'https://api.deepseek.com/v1', llmModel: 'deepseek-chat',
  }
}

export async function loadSettings(dataDir: string): Promise<Settings> {
  const file = join(dataDir, 'settings.json')
  if (!existsSync(file)) return defaultSettings(dataDir)
  return { ...defaultSettings(dataDir), ...JSON.parse(readFileSync(file, 'utf8')) }
}

export async function saveSettings(s: Settings): Promise<void> {
  mkdirSync(s.dataDir, { recursive: true })
  writeFileSync(join(s.dataDir, 'settings.json'), JSON.stringify(s, null, 2))
}
