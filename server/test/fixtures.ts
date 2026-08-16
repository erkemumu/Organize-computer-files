import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
export function makeFixture(root: string): void {
  mkdirSync(join(root, 'Program Files', 'Tool'), { recursive: true })
  writeFileSync(join(root, 'Program Files', 'Tool', 'app.exe'), 'MZ')
  mkdirSync(join(root, 'Photos', '2026'), { recursive: true })
  writeFileSync(join(root, 'Photos', '2026', 'a.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xe0]))
  writeFileSync(join(root, 'Photos', 'b.pdf'), '%PDF-1.4')
  mkdirSync(join(root, 'Notes'), { recursive: true })
  writeFileSync(join(root, 'Notes', 'todo.txt'), 'hello')
}
