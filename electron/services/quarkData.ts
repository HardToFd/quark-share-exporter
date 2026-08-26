import { randomBytes } from 'node:crypto'
import { basename } from 'node:path'
import type {
  CloudEntry,
  LocalEntry,
  ScopeSettings,
  ShareExportRow,
  WorkflowSource
} from '../../src/shared/types/desktop'

export interface RawCloudItem {
  fid?: unknown
  filename?: unknown
  file?: unknown
  file_type?: unknown
  category?: unknown
  size?: unknown
  parent_fid?: unknown
  path?: unknown
  updated_at?: unknown
}

export interface UploadSuccess {
  fid: string
  fileName: string
  fileSize: number
}

export interface MappedUpload extends UploadSuccess {
  sourcePath: string
  relativePath: string
  depth: number
  mappingConfidence: 'exact' | 'ambiguous' | 'unmatched'
}

export function createSessionId(now = Math.floor(Date.now() / 1000)): string {
  return `${now}-${randomBytes(3).toString('hex')}`
}

export function normalizeCloudPath(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/^\/+|\/+$/g, '')
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function normalizeCloudItems(rawItems: RawCloudItem[], pathPrefix = ''): CloudEntry[] {
  const normalizedPrefix = normalizeCloudPath(pathPrefix)

  return rawItems
    .map((item): CloudEntry | null => {
      const fid = asString(item.fid)
      const name = asString(item.filename) || asString(item.file)
      if (!fid || !name) return null

      const rawPath = normalizeCloudPath(asString(item.path))
      const fullPath =
        rawPath === name || rawPath.endsWith(`/${name}`)
          ? rawPath
          : normalizeCloudPath([rawPath, name].filter(Boolean).join('/'))
      const isFolder = asString(item.file_type) === '0' || asNumber(item.category, -1) === 0
      const category = Number(item.category)

      let relativePath = fullPath
      let depth = Math.max(0, fullPath.split('/').filter(Boolean).length - 1)
      if (normalizedPrefix) {
        if (fullPath === normalizedPrefix) {
          relativePath = ''
          depth = 0
        } else if (fullPath.startsWith(`${normalizedPrefix}/`)) {
          relativePath = fullPath.slice(normalizedPrefix.length + 1)
          depth = relativePath.split('/').filter(Boolean).length
        } else {
          return null
        }
      }

      return {
        fid,
        name,
        kind: isFolder ? 'folder' : 'file',
        category: Number.isFinite(category) ? category : undefined,
        size: asNumber(item.size),
        parentFid: asString(item.parent_fid) || undefined,
        path: rawPath,
        fullPath,
        relativePath,
        depth,
        updatedAt: asNumber(item.updated_at) || undefined
      }
    })
    .filter((item): item is CloudEntry => item !== null)
}

export function selectByScope<T extends { kind: 'file' | 'folder'; depth: number }>(
  items: T[],
  scope: ScopeSettings
): T[] {
  return items.filter((item) => {
    if (!scope.includeRoot && item.depth === 0) return false
    if (scope.maxDepth !== null && item.depth > scope.maxDepth) return false
    if (item.kind === 'file' && !scope.includeFiles) return false
    if (item.kind === 'folder' && !scope.includeFolders) return false
    return true
  })
}

export function mapUploadSuccesses(
  localEntries: LocalEntry[],
  uploads: UploadSuccess[]
): MappedUpload[] {
  const fileEntries = localEntries.filter((entry) => entry.kind === 'file')
  const buckets = new Map<string, { entries: LocalEntry[]; ambiguous: boolean }>()

  for (const entry of fileEntries) {
    const key = `${entry.name.toLocaleLowerCase()}\u0000${entry.size}`
    const bucket = buckets.get(key) ?? { entries: [], ambiguous: false }
    bucket.entries.push(entry)
    bucket.ambiguous = bucket.entries.length > 1
    buckets.set(key, bucket)
  }

  return uploads.map((upload) => {
    const key = `${upload.fileName.toLocaleLowerCase()}\u0000${upload.fileSize}`
    const bucket = buckets.get(key)
    const match = bucket?.entries.shift()
    if (bucket?.entries.length === 0) buckets.delete(key)

    return {
      ...upload,
      sourcePath: match?.path ?? '',
      relativePath: match?.relativePath ?? upload.fileName,
      depth: match?.depth ?? 1,
      mappingConfidence: match ? (bucket?.ambiguous ? 'ambiguous' : 'exact') : 'unmatched'
    }
  })
}

export function isAuthenticationError(message: string, code?: number): boolean {
  return (
    code === -1408 ||
    /未授权|未登录|认证|access.?token|invalid token|token expired/i.test(message)
  )
}

export function extractAuthorizationUrl(message: string): string | undefined {
  return message.match(/https?:\/\/[^\s\])}]+/)?.[0]
}

export function expiryLabel(type: number): string {
  return (
    {
      1: '永久有效',
      2: '1 天',
      3: '7 天',
      4: '30 天',
      5: '60 天',
      6: '100 天',
      7: '180 天'
    } as Record<number, string>
  )[type] ?? '未知'
}

export function safeExportBaseName(value: string): string {
  const cleaned = value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/[. ]+$/g, '')
  return cleaned || `夸克分享链-${new Date().toISOString().slice(0, 10)}`
}

export function sourceItemPath(source: WorkflowSource, relativePath: string): string {
  if (source.mode === 'local') {
    const entry = source.localEntries.find((candidate) => candidate.relativePath === relativePath)
    return entry?.path ?? basename(relativePath)
  }
  const entry = source.cloudItems.find((candidate) => candidate.relativePath === relativePath)
  return entry?.fullPath ?? relativePath
}

export function summarizeRows(rows: ShareExportRow[]): {
  successCount: number
  failedCount: number
} {
  return rows.reduce(
    (summary, row) => {
      if (row.status === 'success') summary.successCount += 1
      if (row.status === 'failed') summary.failedCount += 1
      return summary
    },
    { successCount: 0, failedCount: 0 }
  )
}
