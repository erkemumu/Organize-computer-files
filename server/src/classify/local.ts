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
