import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { buildTargetPath, categoryDir } from '../src/plan/paths.js'
import { planFiles } from '../src/plan/planner.js'
import type { FileRecord } from '../src/types.js'

describe('planner paths', () => {
  it('maps category to chinese dir and year path', () => {
    expect(categoryDir('image')).toBe('图片')
    expect(buildTargetPath('D:/归档', 'document', 2026, 'a.pdf')).toBe(join('D:/归档', '文档', '2026', 'a.pdf'))
  })
})

describe('planFiles', () => {
  it('skips identical, renames conflicting, moves new', async () => {
    const mk = (id: number, path: string): FileRecord => ({ id, path, size: 3, mtimeMs: new Date('2026-01-01').getTime(), ext: 'jpg', category: 'image', labels: [], scanRunId: 1 })
    const files = [mk(1, 'C:/src/a.jpg'), mk(2, 'C:/src2/a.jpg'), mk(3, 'C:/src3/new.jpg')]
    // archive already has a.jpg (hashA); src2 matches it; src differs
    const hashOf = async (p: string) => (p.includes('归档') ? 'hashA' : p.includes('src2') ? 'hashA' : 'hashB')
    const exists = async (p: string) => p.includes('归档') && p.endsWith('a.jpg')
    const rows = await planFiles(files, 'D:/归档', { hashOf, exists })
    const a = rows.find(r => r.fileId === 1)!
    const b = rows.find(r => r.fileId === 2)!
    const c = rows.find(r => r.fileId === 3)!
    expect(a.reason).toBe('conflict-renamed')
    expect(a.to).toBe(join('D:/归档', '图片', '2026', 'a (1).jpg'))
    expect(b.reason).toBe('already-exists')
    expect(c.reason).toBe('move')
    expect(c.to).toBe(join('D:/归档', '图片', '2026', 'new.jpg'))
  })
})
