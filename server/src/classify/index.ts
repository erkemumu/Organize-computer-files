import type { Category, Settings } from '../types.js'
import { classifyLocal } from './local.js'
import { classifyLlm } from './llm.js'

export async function classifyFile(input: { path: string; size: number; ext: string; magic: string; settings: Settings }): Promise<{ category: Category; labels: string[] }> {
  const category = classifyLocal({ path: input.path, ext: input.ext, magic: input.magic })
  let labels: string[] = []
  if (input.settings.llmEnabled && input.settings.llmApiKey) {
    try {
      labels = await classifyLlm(input.settings, {
        filename: input.path.split(/[\\/]/).pop()!,
        ext: input.ext,
        size: input.size,
      })
    } catch {
      labels = []
    }
  }
  return { category, labels }
}
