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
