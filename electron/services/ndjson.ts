export interface CliEnvelope<T = Record<string, unknown>> {
  code?: number
  msg: string
  action: string
  type: 'result' | 'progress' | 'list' | 'artifact' | string
  data: T
}

export function parseNdjsonLine(line: string): CliEnvelope | null {
  const cleaned = line.replace(/\u001b\[[0-9;]*m/g, '').trim()
  if (!cleaned.startsWith('{') || !cleaned.endsWith('}')) return null

  try {
    const parsed = JSON.parse(cleaned) as Partial<CliEnvelope>
    if (typeof parsed.type !== 'string' || typeof parsed.msg !== 'string') return null
    return {
      code: parsed.code,
      msg: parsed.msg,
      action: typeof parsed.action === 'string' ? parsed.action : 'unknown',
      type: parsed.type,
      data: (parsed.data ?? {}) as Record<string, unknown>
    }
  } catch {
    return null
  }
}

export class NdjsonAccumulator {
  private pending = ''

  push(chunk: string): Array<{ raw: string; parsed: CliEnvelope | null }> {
    this.pending += chunk
    const lines = this.pending.split(/\r?\n/)
    this.pending = lines.pop() ?? ''
    return lines.filter(Boolean).map((raw) => ({ raw, parsed: parseNdjsonLine(raw) }))
  }

  flush(): Array<{ raw: string; parsed: CliEnvelope | null }> {
    if (!this.pending.trim()) return []
    const raw = this.pending
    this.pending = ''
    return [{ raw, parsed: parseNdjsonLine(raw) }]
  }
}
