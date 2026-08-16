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
