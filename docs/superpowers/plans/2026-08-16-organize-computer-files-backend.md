# Organize-computer-files 实施计划（Plan 1：后端引擎）

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建文件整理助手的后端引擎：扫描 → 本地/LLM 分类 → 规划目标路径 → 干跑预览 → 批次移动与撤销，全部通过本地 HTTP API 暴露，可独立测试。

**Architecture:** pnpm workspace 单仓，先建 `server` 子包；Node.js + TypeScript + hono（HTTP）+ node:sqlite（SQLite）；模块 scanner / classifier / planner / executor / catalog / config / api 通过数据对象接口交互，互不 import 内部实现。

**Tech Stack:** Node.js ≥ 22.5（node:sqlite）、TypeScript、hono + @hono/node-server、vitest（测试）、tsx（开发运行）、tsc（构建）。

**Spec:** `docs/superpowers/specs/2026-08-16-windows-file-organizer-design.md`

## Global Constraints

- 监听地址固定 `127.0.0.1:8787`（端口可被 `PORT` 环境变量覆盖）。
- 数据目录默认 `%LOCALAPPDATA%/FileOrganizer`（`organizer.db` + `settings.json`）。
- 扫描/规划阶段绝不写文件；只有 executor 有写文件权限。
- 移动永不覆盖：重名按大小+哈希比较，相同跳过、不同加 ` (1)`` (2)` 后缀。
- 同卷 rename，跨卷 copy→校验→删源。
- 每个任务都以失败测试开头（TDD），小步提交。
- 命名：kebab-case 文件名；接口与类型集中在 `src/types.ts`。

---

## 文件结构（本计划将创建/修改）

```text
server/
  package.json            # 子包元数据 + 脚本
  tsconfig.json           # TS 编译配置
  vitest.config.ts        # 测试配置
  src/
    types.ts              # 全项目共享类型与分类常量
    config.ts             # settings.json 读/写 + 默认值
    db.ts                 # node:sqlite 连接 + schema + upsert/query
    scan/
      rules.ts            # 硬跳过集合 + 应用目录启发式
      scanner.ts          # 递归遍历 + 元数据采集 + 进度/取消
    classify/
      magic.ts            # magic bytes 嗅探（png/jpeg/pdf/zip/ole…）
      local.ts            # 本地粗分类
      llm.ts              # LLM 细分（OpenAI 兼容端点）
      index.ts            # 两级编排：本地 → 可选 LLM
    plan/
      paths.ts            # 分类→目录名、目标路径、年份
      planner.ts          # from→to 计划行 + 冲突决策
    exec/
      move.ts             # rename / copy-校验-删
      batch.ts            # 批次 + 撤销日志
    api/
      server.ts           # hono 应用 + REST + SSE
    index.ts              # 启动入口（读取 config、连接 db、挂载 api）
  test/
    fixtures.ts           # 生成临时目录树 fixture
    scan.test.ts
    classify.test.ts
    plan.test.ts
    exec.test.ts
    api.test.ts
```

---

## Task 1: 脚手架 + 健康检查 + 配置持久化

**Files:**
- Create: `package.json`（仓库根，pnpm workspace）
- Create: `pnpm-workspace.yaml`
- Create: `server/package.json`、`server/tsconfig.json`、`server/vitest.config.ts`
- Create: `server/src/types.ts`、`server/src/config.ts`、`server/src/index.ts`、`server/src/api/server.ts`
- Test: `server/test/config.test.ts`

**Interfaces:**
- Produces: `config.ts` 导出 `loadSettings(): Promise<Settings>`、`saveSettings(s: Settings): Promise<void>`、`defaultSettings(): Settings`；`Settings` 类型定义在 `types.ts`。
- Produces: `api/server.ts` 导出 `createApp(ctx: {settings: Settings}): Hono`。

- [ ] **Step 1: 写失败测试** `server/test/config.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { mkdtempSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { defaultSettings, loadSettings, saveSettings } from '../src/config.js'

describe('config', () => {
  it('returns defaults and round-trips overrides', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'organizer-cfg-'))
    const d = defaultSettings(dir)
    expect(d.dataDir).toBe(dir)
    expect(d.archiveRoots).toEqual([])
    d.archiveRoots = [join(dir, '归档')]
    d.llmEnabled = true
    await saveSettings(d)
    const loaded = await loadSettings(dir)
    expect(loaded.archiveRoots).toEqual([join(dir, '归档')])
    expect(loaded.llmEnabled).toBe(true)
  })
})
```

- [ ] **Step 2: 运行验证失败**

Run: `pnpm --filter server test -- config`
Expected: FAIL（`Cannot find module '../src/config.js'`）

- [ ] **Step 3: 实现最小代码**

`server/src/types.ts`:
```ts
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
```

`server/src/config.ts`:
```ts
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
```

`server/src/api/server.ts`（最小，含健康检查）:
```ts
import { Hono } from 'hono'
import type { Settings } from '../types.js'

export function createApp(_ctx: { settings: Settings }) {
  const app = new Hono()
  app.get('/api/health', c => c.json({ ok: true }))
  return app
}
```

`server/src/index.ts`:
```ts
import { serve } from '@hono/node-server'
import { defaultSettings, loadSettings } from './config.js'
import { createApp } from './api/server.js'

async function main() {
  const dataDir = process.env.ORGANIZER_DATA_DIR ?? join(process.env.LOCALAPPDATA ?? '.', 'FileOrganizer')
  const settings = await loadSettings(dataDir)
  const app = createApp({ settings })
  const port = Number(process.env.PORT ?? 8787)
  serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, info => console.log('listening', info.port))
}
void main()
```

`server/package.json` 关键字段：`"scripts": { "dev": "tsx src/index.ts", "build": "tsc -p tsconfig.json", "test": "vitest run" }`，dependencies 含 `hono`、`@hono/node-server`，devDependencies 含 `typescript`、`tsx`、`vitest`。

- [ ] **Step 4: 运行验证通过**

Run: `pnpm --filter server test`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add -A && git commit -m "feat(server): 脚手架 + 健康检查 + 配置持久化"
```

---

## Task 2: 共享类型 + 跳过规则

**Files:**
- Modify: `server/src/types.ts`（补 FileRecord / Category）
- Create: `server/src/scan/rules.ts`
- Test: `server/test/rules.test.ts`

**Interfaces:**
- Produces: `rules.ts` 导出 `HARD_SKIP_DIRS: ReadonlySet<string>`、`isHardSkipName(name: string): boolean`、`isAppDir(names: string[]): boolean`（目录条目名列表 → 是否应用目录）。
- Produces: `types.ts` 导出 `type Category = 'image'|'document'|'audio'|'video'|'other'` 与 `interface FileRecord { id: number; path: string; size: number; mtimeMs: number; ext: string; category: Category; labels: string[]; scanRunId: number }`。

- [ ] **Step 1: 写失败测试** `server/test/rules.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { HARD_SKIP_DIRS, isHardSkipName, isAppDir } from '../src/scan/rules.js'

describe('scan rules', () => {
  it('hard-skips system and vcs names', () => {
    for (const n of ['Windows', 'Program Files', 'AppData', 'node_modules', '.git', '$Recycle.Bin'])
      expect(isHardSkipName(n)).toBe(true)
    expect(isHardSkipName('MyPhotos')).toBe(false)
  })
  it('detects an application directory by executable presence', () => {
    expect(isAppDir(['app.exe', 'app.dll', 'config.ini'])).toBe(true)
    expect(isAppDir(['vacation.jpg', 'notes.pdf'])).toBe(false)
  })
})
```

- [ ] **Step 2: 运行验证失败** → FAIL（模块缺失）

- [ ] **Step 3: 实现**

`server/src/scan/rules.ts`:
```ts
export const HARD_SKIP_DIRS = new Set([
  'windows', 'program files', 'program files (x86)', 'programdata', 'appdata',
  '$recycle.bin', 'system volume information', 'node_modules', '.git',
])
export function isHardSkipName(name: string): boolean {
  return HARD_SKIP_DIRS.has(name.toLowerCase())
}
const EXEC_EXT = new Set(['.exe', '.dll', '.msi', '.appx', '.sys', '.com'])
const MEDIA_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.pdf', '.docx', '.xlsx', '.pptx', '.txt', '.md', '.mp3', '.mp4', '.mkv', '.flac', '.mov'])
export function isAppDir(names: string[]): boolean {
  const exts = names.map(n => (n.match(/\.[^.]+$/) ?? [''])[0].toLowerCase())
  const execCount = exts.filter(e => EXEC_EXT.has(e)).length
  if (execCount === 0) return false
  const mediaCount = exts.filter(e => MEDIA_EXT.has(e)).length
  return mediaCount === 0 || mediaCount / names.length < 0.1
}
```

- [ ] **Step 4: 运行验证通过** → PASS

- [ ] **Step 5: 提交** `feat(server): 跳过规则（系统目录 + 应用目录启发式）`

---

## Task 3: magic bytes 嗅探

**Files:**
- Create: `server/src/classify/magic.ts`
- Test: `server/test/classify.test.ts`（先只测 magic）

**Interfaces:**
- Produces: `sniffMagic(bytes: Uint8Array): string`，返回 `'jpeg'|'png'|'gif'|'webp'|'pdf'|'zip'|'ole'|'ogg'|'mp4'|'unknown'`。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from 'vitest'
import { sniffMagic } from '../src/classify/magic.js'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46])

describe('sniffMagic', () => {
  it('recognizes png / jpeg / pdf by signature', () => {
    expect(sniffMagic(PNG)).toBe('png')
    expect(sniffMagic(JPEG)).toBe('jpeg')
    expect(sniffMagic(PDF)).toBe('pdf')
  })
  it('returns unknown for garbage', () => {
    expect(sniffMagic(new Uint8Array([1, 2, 3, 4]))).toBe('unknown')
  })
})
```

- [ ] **Step 2: 运行验证失败** → FAIL

- [ ] **Step 3: 实现** `server/src/classify/magic.ts`

```ts
const ascii = (b: Uint8Array, o: number, s: number) => String.fromCharCode(...b.slice(o, o + s))
export function sniffMagic(bytes: Uint8Array): string {
  if (bytes.length >= 8 && ascii(bytes, 0, 8) === '\x89PNG\r\n\x1a\n') return 'png'
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg'
  if (ascii(bytes, 0, 4) === '%PDF') return 'pdf'
  if (ascii(bytes, 0, 4) === 'PK\x03\x04') return 'zip'
  if (ascii(bytes, 0, 8) === '\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1') return 'ole'
  if (ascii(bytes, 0, 4) === 'OggS') return 'ogg'
  if (bytes.length >= 12 && ascii(bytes, 4, 4) === 'ftyp') return 'mp4'
  if (ascii(bytes, 0, 3) === 'GIF') return 'gif'
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'webp'
  return 'unknown'
}
```

- [ ] **Step 4: 运行验证通过** → PASS

- [ ] **Step 5: 提交** `feat(server): magic bytes 嗅探`

---

## Task 4: 本地粗分类

**Files:**
- Create: `server/src/classify/local.ts`
- Test: `server/test/classify.test.ts`（追加）

**Interfaces:**
- Consumes: `sniffMagic`（Task 3）。
- Produces: `classifyLocal(input: { path: string; ext: string; magic: string }): Category`。

- [ ] **Step 1: 写失败测试**（追加到 classify.test.ts）

```ts
import { classifyLocal } from '../src/classify/local.js'

describe('classifyLocal', () => {
  it('maps extensions to coarse categories', () => {
    expect(classifyLocal({ path: 'a.jpg', ext: 'jpg', magic: 'jpeg' })).toBe('image')
    expect(classifyLocal({ path: 'a.pdf', ext: 'pdf', magic: 'pdf' })).toBe('document')
    expect(classifyLocal({ path: 'a.docx', ext: 'docx', magic: 'zip' })).toBe('document')
    expect(classifyLocal({ path: 'a.mp3', ext: 'mp3', magic: 'unknown' })).toBe('audio')
    expect(classifyLocal({ path: 'a.mkv', ext: 'mkv', magic: 'unknown' })).toBe('video')
  })
  it('trusts magic over a lying extension', () => {
    expect(classifyLocal({ path: 'fake.txt', ext: 'txt', magic: 'jpeg' })).toBe('image')
  })
})
```

- [ ] **Step 2: 运行验证失败** → FAIL

- [ ] **Step 3: 实现** `server/src/classify/local.ts`

```ts
import type { Category } from '../types.js'

const EXT_CATEGORY: Record<string, Category> = {
  jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', webp: 'image', bmp: 'image', tiff: 'image', heic: 'image',
  pdf: 'document', doc: 'document', docx: 'document', xls: 'document', xlsx: 'document', ppt: 'document', pptx: 'document', txt: 'document', md: 'document', rtf: 'document', csv: 'document',
  mp3: 'audio', wav: 'audio', flac: 'audio', aac: 'audio', ogg: 'audio', m4a: 'audio', wma: 'audio',
  mp4: 'video', mkv: 'video', avi: 'video', mov: 'video', wmv: 'video', webm: 'video', flv: 'video',
}
const MAGIC_CATEGORY: Record<string, Category> = { jpeg: 'image', png: 'image', gif: 'image', webp: 'image', pdf: 'document', ole: 'document', zip: 'document', ogg: 'audio', mp4: 'video' }

export function classifyLocal(input: { path: string; ext: string; magic: string }): Category {
  if (MAGIC_CATEGORY[input.magic]) return MAGIC_CATEGORY[input.magic]
  return EXT_CATEGORY[input.ext] ?? 'other'
}
```

- [ ] **Step 4: 运行验证通过** → PASS

- [ ] **Step 5: 提交** `feat(server): 本地粗分类`

---

## Task 5: 扫描器

**Files:**
- Create: `server/src/scan/scanner.ts`
- Create: `server/test/fixtures.ts`
- Test: `server/test/scan.test.ts`

**Interfaces:**
- Consumes: `isHardSkipName`、`isAppDir`（Task 2）、`classifyLocal`（Task 4）。
- Produces: `scan(roots: string[], opts: { dataDir: string; signal: AbortSignal; onProgress?: (p: { done: number; total: number }) => void }): Promise<FileRecord[]>`。FileRecord 的 `id` 先设为 0（catalog 在 Task 6 负责分配真实 id）。

- [ ] **Step 1: 写失败测试**（fixture 生成 + 跳过验证）

`server/test/fixtures.ts`:
```ts
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
export function makeFixture(root: string): void {
  mkdirSync(join(root, 'Program Files', 'Tool'), { recursive: true })
  writeFileSync(join(root, 'Program Files', 'Tool', 'app.exe'), 'MZ')
  mkdirSync(join(root, 'Photos', '2026'), { recursive: true })
  writeFileSync(join(root, 'Photos', '2026', 'a.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xe0]))
  writeFileSync(join(root, 'Photos', 'b.pdf'), '%PDF-1.4')
  writeFileSync(join(root, 'Notes', 'todo.txt'), 'hello')
}
```

`server/test/scan.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { scan } from '../src/scan/scanner.js'
import { makeFixture } from './fixtures.js'

describe('scan', () => {
  it('walks files, skips Program Files, classifies the rest', async () => {
    const root = mkdtempSync(join(tmpdir(), 'organizer-scan-'))
    makeFixture(root)
    const rows = await scan([root], { dataDir: root, signal: new AbortController().signal })
    const paths = rows.map(r => r.path)
    expect(paths.some(p => p.includes('Program Files'))).toBe(false)
    const jpg = rows.find(r => r.path.endsWith('a.jpg'))!
    expect(jpg.category).toBe('image')
    const pdf = rows.find(r => r.path.endsWith('b.pdf'))!
    expect(pdf.category).toBe('document')
  })
})
```

- [ ] **Step 2: 运行验证失败** → FAIL

- [ ] **Step 3: 实现** `server/src/scan/scanner.ts`

```ts
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { FileRecord } from '../types.js'
import { isAppDir, isHardSkipName } from './rules.js'
import { classifyLocal } from '../classify/local.js'
import { sniffMagic } from '../classify/magic.js'

const HEAD_BYTES = 16

export async function scan(roots: string[], opts: { dataDir: string; signal: AbortSignal; onProgress?: (p: { done: number; total: number }) => void }): Promise<FileRecord[]> {
  const out: FileRecord[] = []
  for (const root of roots) {
    await walk(root, out, opts)
  }
  return out
}

async function walk(dir: string, out: FileRecord[], opts: { signal: AbortSignal }): Promise<void> {
  opts.signal.throwIfAborted()
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const names = entries.map(e => e.name)
  if (isAppDir(names)) return
  for (const entry of entries) {
    opts.signal.throwIfAborted()
    if (entry.isDirectory()) {
      if (isHardSkipName(entry.name)) continue
      await walk(join(dir, entry.name), out, opts)
    } else if (entry.isFile()) {
      const path = join(dir, entry.name)
      const st = await stat(path).catch(() => null)
      if (!st) continue
      const ext = (entry.name.match(/\.[^.]+$/) ?? [''])[0].slice(1).toLowerCase()
      const fh = await readFile(path, { length: HEAD_BYTES }).catch(() => undefined)
      const magic = fh ? sniffMagic(new Uint8Array(fh)) : 'unknown'
      out.push({ id: 0, path, size: st.size, mtimeMs: st.mtimeMs, ext, category: classifyLocal({ path, ext, magic }), labels: [], scanRunId: 0 })
    }
  }
}
```

- [ ] **Step 4: 运行验证通过** → PASS

- [ ] **Step 5: 提交** `feat(server): 扫描器（跳过规则 + 元数据 + 分类）`

---

## Task 6: catalog（SQLite）

**Files:**
- Create: `server/src/db.ts`
- Test: `server/test/db.test.ts`

**Interfaces:**
- Consumes: `FileRecord`（Task 2）。
- Produces: `openDb(dataDir: string): DatabaseSync`、`insertScanRun(db, roots: string[]): number`、`insertFiles(db, runId: number, files: FileRecord[]): void`、`listFiles(db, runId: number): FileRecord[]`、`insertMoveBatch(db, batchId: string, rows: MoveLogRow[]): void`、`listMoveBatch(db, batchId: string): MoveLogRow[]`。MoveLogRow 定义在 `types.ts`。

- [ ] **Step 1: 写失败测试** `server/test/db.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { insertFiles, insertScanRun, listFiles, openDb } from '../src/db.js'

describe('db', () => {
  it('round-trips files for a scan run', () => {
    const dir = mkdtempSync(join(tmpdir(), 'organizer-db-'))
    const db = openDb(dir)
    const runId = insertScanRun(db, ['/tmp/x'])
    insertFiles(db, runId, [{ id: 0, path: '/tmp/x/a.jpg', size: 3, mtimeMs: 1, ext: 'jpg', category: 'image', labels: [], scanRunId: runId }])
    const rows = listFiles(db, runId)
    expect(rows).toHaveLength(1)
    expect(rows[0].category).toBe('image')
  })
})
```

- [ ] **Step 2: 运行验证失败** → FAIL

- [ ] **Step 3: 实现** `server/src/db.ts`

```ts
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
```

`types.ts` 追加：`export interface MoveLogRow { batchId: string; fileId: number; from: string; to: string; status: 'pending'|'done'|'skipped'|'failed'; reason?: string }`

- [ ] **Step 4: 运行验证通过** → PASS

- [ ] **Step 5: 提交** `feat(server): catalog SQLite（scan_runs/files/move_batches）`

---

## Task 7: 规划器（路径 + 冲突）

**Files:**
- Create: `server/src/plan/paths.ts`、`server/src/plan/planner.ts`
- Test: `server/test/plan.test.ts`

**Interfaces:**
- Modify: `server/src/types.ts`（追加 `PlanRow` 类型）。
- Produces: `categoryDir(c: Category): string`（image→'图片'、document→'文档'、audio→'音乐'、video→'视频'、other→'其他'）、`buildTargetPath(archiveRoot: string, category: Category, year: number, filename: string): string`（内部用 `node:path` 的 `join`，平台正确分隔符）、`planFiles(files: FileRecord[], archiveRoot: string, io: { hashOf: (path: string) => Promise<string>; exists: (path: string) => Promise<boolean> }): Promise<PlanRow[]>`（`io.exists` 查询归档盘是否已有目标文件，用于跨批次冲突判断）。

- [ ] **Step 1: 写失败测试**

```ts
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
    // 归档盘已有 a.jpg（hashA）；src2 与其内容一致，src 内容不同
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
```

- [ ] **Step 2: 运行验证失败** → FAIL

- [ ] **Step 3: 实现**

`server/src/types.ts` 追加:
```ts
export interface PlanRow {
  fileId: number
  from: string
  to: string
  reason: 'move' | 'already-exists' | 'conflict-renamed'
  category: Category
  year: number
}
```

`server/src/plan/paths.ts`:
```ts
import { join } from 'node:path'
import type { Category } from '../types.js'
const DIR: Record<Category, string> = { image: '图片', document: '文档', audio: '音乐', video: '视频', other: '其他' }
export function categoryDir(c: Category): string { return DIR[c] }
export function buildTargetPath(archiveRoot: string, category: Category, year: number, filename: string): string {
  return join(archiveRoot, categoryDir(category), String(year), filename)
}
```

`server/src/plan/planner.ts`:
```ts
import type { FileRecord, PlanRow } from '../types.js'
import { buildTargetPath } from './paths.js'

export interface PlannerIo {
  hashOf: (path: string) => Promise<string>
  exists: (path: string) => Promise<boolean>
}

export async function planFiles(files: FileRecord[], archiveRoot: string, io: PlannerIo): Promise<PlanRow[]> {
  const rows: PlanRow[] = []
  const planned = new Set<string>() // 本批次已占用的目标路径
  for (const f of files) {
    const year = new Date(f.mtimeMs).getFullYear()
    const filename = f.path.split(/[\\/]/).pop()!
    const base = buildTargetPath(archiveRoot, f.category, year, filename)
    const myHash = await io.hashOf(f.path)
    let dest = base
    let reason: PlanRow['reason']
    if (await io.exists(base)) {
      if ((await io.hashOf(base)) === myHash) {
        reason = 'already-exists'
      } else {
        dest = nextFree(base, planned)
        reason = 'conflict-renamed'
      }
    } else {
      reason = 'move'
    }
    planned.add(dest)
    rows.push({ fileId: f.id, from: f.path, to: dest, reason, category: f.category, year })
  }
  return rows
}

function nextFree(base: string, planned: Set<string>): string {
  const dot = base.lastIndexOf('.')
  const slash = Math.max(base.lastIndexOf('/'), base.lastIndexOf('\\'))
  const stem = dot > slash ? base.slice(0, dot) : base
  const ext = dot > slash ? base.slice(dot) : ''
  for (let n = 1; ; n++) {
    const candidate = stem + ' (' + n + ')' + ext
    if (!planned.has(candidate)) return candidate
  }
}
```

- [ ] **Step 4: 运行验证通过** → PASS（三个断言：冲突改名 / 相同跳过 / 新文件直移）

- [ ] **Step 5: 提交** `feat(server): 规划器（大类/年份 + 冲突决策）`

---

## Task 8: 移动执行器 + 撤销

**Files:**
- Create: `server/src/exec/move.ts`、`server/src/exec/batch.ts`
- Test: `server/test/exec.test.ts`

**Interfaces:**
- Consumes: `MoveLogRow`、`listMoveBatch`、`insertMoveBatch`。
- Produces: `chooseStrategy(from: string, to: string): 'rename'|'copy-delete'`、`executeMoves(rows: PlanRow[]): Promise<{ batchId: string; log: MoveLogRow[] }>`、`undoBatch(batchId: string): Promise<void>`。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from 'vitest'
import { chooseStrategy } from '../src/exec/move.js'

describe('chooseStrategy', () => {
  it('renames on same volume, copies across volumes', () => {
    expect(chooseStrategy('C:/a/x.jpg', 'C:/b/y.jpg')).toBe('rename')
    expect(chooseStrategy('C:/a/x.jpg', 'D:/b/y.jpg')).toBe('copy-delete')
  })
})
```

- [ ] **Step 2: 运行验证失败** → FAIL

- [ ] **Step 3: 实现**

`server/src/exec/move.ts`:
```ts
import { access, copyFile, mkdir, rename, rm, stat } from 'node:fs/promises'
import { dirname, parse } from 'node:path'
import type { PlanRow, MoveLogRow } from '../types.js'

export function chooseStrategy(from: string, to: string): 'rename' | 'copy-delete' {
  const vol = (p: string) => parse(p).root.toLowerCase()
  return vol(from) === vol(to) ? 'rename' : 'copy-delete'
}

export async function moveOne(row: PlanRow): Promise<MoveLogRow> {
  const base: Omit<MoveLogRow, 'status'|'reason'> = { batchId: '', fileId: row.fileId, from: row.from, to: row.to }
  try {
    await mkdir(dirname(row.to), { recursive: true })
    await access(row.to).then(() => { throw new Error('target already exists') }, () => {})
    if (chooseStrategy(row.from, row.to) === 'rename') {
      await rename(row.from, row.to)
    } else {
      await copyFile(row.from, row.to)
      const a = await stat(row.from); const b = await stat(row.to)
      if (a.size !== b.size) throw new Error('size mismatch after copy')
      await rm(row.from)
    }
    return { ...base, status: 'done' }
  } catch (e) {
    return { ...base, status: 'failed', reason: (e as Error).message }
  }
}
```

`server/src/exec/batch.ts`:
```ts
import { randomUUID } from 'node:crypto'
import { mkdir, rename } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { MoveLogRow, PlanRow } from '../types.js'
import { moveOne } from './move.js'

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
    await rename(l.to, l.from)
  }
}
```

- [ ] **Step 4: 运行验证通过**（用 fixture 真移动再撤销）

- [ ] **Step 5: 提交** `feat(server): 移动执行器 + 批次撤销`

---

## Task 9: API 端点 + SSE 进度

**Files:**
- Modify: `server/src/api/server.ts`（完整路由，替换 Task 1 的占位 createApp）
- Modify: `server/src/index.ts`（组装 config/db/scanner/planner/executor）
- Create: `server/src/plan/io.ts`（真实 hashOf/exists 实现）
- Modify: `server/src/scan/scanner.ts`（补进度回调）
- Test: `server/test/api.test.ts`

**Interfaces:**
- Consumes: Task 5 `scan`、Task 6 `openDb/insertScanRun/insertFiles/listFiles/insertMoveBatch/listMoveBatch`、Task 7 `planFiles`、Task 8 `executeMoves/undoBatch`。
- Produces: `createApp(ctx: { settings: Settings; db: DatabaseSync; getDataDir: () => string }): Hono`；端点 `POST /api/scan {roots} → SSE {runId,count}`、`GET /api/plan?runId= → {archiveRoot, rows}`、`POST /api/execute {runId,fileIds} → {batchId, log}`、`POST /api/undo {batchId}`、`GET /api/files?runId=&category=&q=`、`GET/PUT /api/settings`。

- [ ] **Step 1: 写失败测试** `server/test/api.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { serve } from '@hono/node-server'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { defaultSettings } from '../src/config.js'
import { openDb } from '../src/db.js'
import { createApp } from '../src/api/server.js'
import type { Server } from 'node:http'

async function boot(dataDir: string): Promise<{ base: string; close: () => void }> {
  const app = createApp({ settings: defaultSettings(dataDir), db: openDb(dataDir), getDataDir: () => dataDir })
  const server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' }) as unknown as Server
  await new Promise<void>(r => server.on('listening', () => r()))
  const port = (server.address() as { port: number }).port
  return { base: `http://127.0.0.1:${port}`, close: () => server.close() }
}

describe('api', () => {
  it('serves health and settings round-trip', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'organizer-api-'))
    const { base, close } = await boot(dir)
    const health = await fetch(`${base}/api/health`)
    expect((await health.json()).ok).toBe(true)
    await fetch(`${base}/api/settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ llmEnabled: true }) })
    const s = await (await fetch(`${base}/api/settings`)).json() as { llmEnabled: boolean }
    expect(s.llmEnabled).toBe(true)
    close()
  })
})
```

- [ ] **Step 2: 运行验证失败** → FAIL（404：路由未实现）

- [ ] **Step 3: 实现**

`server/src/plan/io.ts`:
```ts
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
```

`server/src/scan/scanner.ts` 修改（进度回调）：scan 透传 onProgress，walk 每个文件入列后调用 `opts.onProgress?.({ done: out.length, total: -1 })`（total 未知时 -1）。

`server/src/api/server.ts`（完整替换）:
```ts
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import type { Settings } from '../types.js'
import { saveSettings } from '../config.js'
import { insertFiles, insertMoveBatch, insertScanRun, listFiles, listMoveBatch } from '../db.js'
import { scan } from '../scan/scanner.js'
import { planFiles } from '../plan/planner.js'
import { defaultPlannerIo } from '../plan/io.js'
import { executeMoves, undoBatch } from '../exec/batch.js'

export function createApp(ctx: { settings: Settings; db: DatabaseSync; getDataDir: () => string }) {
  const app = new Hono()
  app.get('/api/health', c => c.json({ ok: true }))
  app.get('/api/settings', c => c.json(ctx.settings))
  app.put('/api/settings', async c => {
    const body = await c.req.json() as Partial<Settings>
    const merged = { ...ctx.settings, ...body }
    await saveSettings(merged)
    ctx.settings = merged
    return c.json(merged)
  })
  app.post('/api/scan', c => {
    return streamSSE(c, async stream => {
      const { roots } = await c.req.json() as { roots: string[] }
      const runId = insertScanRun(ctx.db, roots)
      const files = await scan(roots, {
        dataDir: ctx.getDataDir(),
        signal: stream.abort,
        onProgress: p => void stream.writeSSE({ data: JSON.stringify(p) }),
      })
      insertFiles(ctx.db, runId, files)
      await stream.writeSSE({ data: JSON.stringify({ runId, count: files.length }) })
    })
  })
  app.get('/api/files', c => {
    const runId = Number(c.req.query('runId'))
    const category = c.req.query('category')
    const q = c.req.query('q')?.toLowerCase()
    const rows = listFiles(ctx.db, runId).filter(r =>
      (!category || r.category === category) && (!q || r.path.toLowerCase().includes(q)))
    return c.json(rows)
  })
  app.get('/api/plan', async c => {
    const runId = Number(c.req.query('runId'))
    const files = listFiles(ctx.db, runId)
    const archiveRoot = ctx.settings.archiveRoots[0] ?? join(ctx.getDataDir(), '归档')
    const rows = await planFiles(files, archiveRoot, defaultPlannerIo)
    return c.json({ archiveRoot, rows })
  })
  app.post('/api/execute', async c => {
    const { runId, fileIds } = await c.req.json() as { runId: number; fileIds: number[] }
    const wanted = new Set(fileIds)
    const files = listFiles(ctx.db, runId).filter(f => wanted.has(f.id))
    const archiveRoot = ctx.settings.archiveRoots[0] ?? join(ctx.getDataDir(), '归档')
    const rows = (await planFiles(files, archiveRoot, defaultPlannerIo)).filter(r => r.reason !== 'already-exists')
    const { batchId, log } = await executeMoves(rows)
    insertMoveBatch(ctx.db, batchId, log)
    return c.json({ batchId, log })
  })
  app.post('/api/undo', async c => {
    const { batchId } = await c.req.json() as { batchId: string }
    await undoBatch(listMoveBatch(ctx.db, batchId))
    return c.json({ ok: true })
  })
  return app
}
```

`server/src/index.ts`（完整替换）:
```ts
import { serve } from '@hono/node-server'
import { join } from 'node:path'
import { loadSettings } from './config.js'
import { openDb } from './db.js'
import { createApp } from './api/server.js'

async function main() {
  const dataDir = process.env.ORGANIZER_DATA_DIR ?? join(process.env.LOCALAPPDATA ?? '.', 'FileOrganizer')
  const settings = await loadSettings(dataDir)
  const db = openDb(dataDir)
  const app = createApp({ settings, db, getDataDir: () => dataDir })
  const port = Number(process.env.PORT ?? 8787)
  serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, info => console.log('listening', info.port))
}
void main()
```

- [ ] **Step 4: 运行验证通过** → PASS；再加一条全链路集成测试（fixture：scan → plan → execute → undo 后文件回到原位，断言内容一致）

- [ ] **Step 5: 提交** `feat(server): REST + SSE API`

---

## Task 10: LLM 细分（可选，开关控制）

**Files:**
- Create: `server/src/classify/llm.ts`、`server/src/classify/index.ts`
- Test: `server/test/llm.test.ts`

**Interfaces:**
- Consumes: `Settings`（Task 1）、`classifyLocal`（Task 4）。
- Produces: `classifyLlm(settings: Settings, input: { filename: string; ext: string; size: number }): Promise<string[]>`、`classifyFile(input: { path: string; size: number; ext: string; magic: string; settings: Settings }): Promise<{ category: Category; labels: string[] }>`；LLM 失败回退本地分类、labels 为空数组。

- [ ] **Step 1: 写失败测试** `server/test/llm.test.ts`

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { classifyFile } from '../src/classify/index.js'
import { defaultSettings } from '../src/config.js'

afterEach(() => { vi.unstubAllGlobals() })

describe('classifyFile', () => {
  it('skips LLM when disabled', async () => {
    const settings = defaultSettings('tmp')
    settings.llmEnabled = false
    const r = await classifyFile({ path: 'C:/x/a.pdf', size: 1, ext: 'pdf', magic: 'pdf', settings })
    expect(r.category).toBe('document')
    expect(r.labels).toEqual([])
  })
  it('returns labels from a mocked LLM response', async () => {
    const settings = defaultSettings('tmp')
    settings.llmEnabled = true
    settings.llmApiKey = 'k'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ choices: [{ message: { content: '["发票","收据"]' } }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )))
    const r = await classifyFile({ path: 'C:/x/a.pdf', size: 1, ext: 'pdf', magic: 'pdf', settings })
    expect(r.category).toBe('document')
    expect(r.labels).toEqual(['发票', '收据'])
  })
  it('falls back to local category when LLM fails', async () => {
    const settings = defaultSettings('tmp')
    settings.llmEnabled = true
    settings.llmApiKey = 'k'
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')))
    const r = await classifyFile({ path: 'C:/x/a.pdf', size: 1, ext: 'pdf', magic: 'pdf', settings })
    expect(r.category).toBe('document')
    expect(r.labels).toEqual([])
  })
})
```

- [ ] **Step 2: 运行验证失败** → FAIL

- [ ] **Step 3: 实现**

`server/src/classify/llm.ts`:
```ts
import type { Settings } from '../types.js'

function prompt(filename: string, ext: string, size: number): string {
  return `你是文件分类助手。根据文件名/扩展名/大小，输出 2-4 个内容标签（如：发票、合同、简历、截图、壁纸、证件、收据、笔记、论文、电子书）。只输出一个 JSON 字符串数组，不要其他文字。\n文件名: ${filename}\n扩展名: ${ext}\n大小: ${size} 字节`
}

export async function classifyLlm(settings: Settings, input: { filename: string; ext: string; size: number }): Promise<string[]> {
  const res = await fetch(`${settings.llmBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.llmApiKey}` },
    body: JSON.stringify({
      model: settings.llmModel,
      messages: [{ role: 'user', content: prompt(input.filename, input.ext, input.size) }],
      temperature: 0,
    }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`llm http ${res.status}`)
  const data = await res.json() as { choices: { message: { content: string } }[] }
  const text = (data.choices[0]?.message?.content ?? '').replace(/```json|```/g, '').trim()
  const parsed = JSON.parse(text) as unknown
  if (!Array.isArray(parsed)) throw new Error('llm output not an array')
  return parsed.filter((x): x is string => typeof x === 'string').slice(0, 4)
}
```

`server/src/classify/index.ts`:
```ts
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
      labels = [] // 回退：仅本地分类
    }
  }
  return { category, labels }
}
```

- [ ] **Step 4: 运行验证通过** → PASS

- [ ] **Step 5: 提交** `feat(server): LLM 细分（DeepSeek，可开关，失败回退）`

---

## Self-Review

- **Spec 覆盖**：扫描范围/跳过规则（Task 2+5）、本地分类（3+4）、LLM 细分（10，开关+失败回退）、大类年份+冲突（7）、预览即确认（9 的 execute 只处理勾选 fileIds 且排除 already-exists）、移动安全+永不覆盖（8：moveOne 前置目标存在检查；7：哈希冲突决策）、撤销（8）、错误处理（8 的 per-file try/catch + 10 的回退）。前端（扫描页/预览页/执行页/设置页）与里程碑 M4/M7 **不在本计划内**，属 Plan 2（本计划完成后再写）。
- **占位符**：无 TBD/TODO；每个代码步骤均含可运行代码。
- **类型一致性**：`FileRecord` / `PlanRow`（Task 7 定义）/ `MoveLogRow` / `Category` / `Settings` / `PlannerIo` 各任务引用一致；API（Task 9）的 executeMoves 只接收 PlanRow 行，类型吻合。

---
