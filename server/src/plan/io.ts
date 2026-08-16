import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access } from 'node:fs/promises'
import type { PlannerIo } from './planner.js'

export async function hashFile(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(path)
    stream.on('error', reject)
    stream.on('data', chunk => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}
export async function fileExists(path: string): Promise<boolean> {
  return access(path).then(() => true, () => false)
}
export const defaultPlannerIo: PlannerIo = { hashOf: hashFile, exists: fileExists }
