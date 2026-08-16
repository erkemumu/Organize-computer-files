import { join } from 'node:path'
import type { Category } from '../types.js'
const DIR: Record<Category, string> = { image: '图片', document: '文档', audio: '音乐', video: '视频', other: '其他' }
export function categoryDir(c: Category): string { return DIR[c] }
export function buildTargetPath(archiveRoot: string, category: Category, year: number, filename: string): string {
  return join(archiveRoot, categoryDir(category), String(year), filename)
}
