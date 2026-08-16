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
