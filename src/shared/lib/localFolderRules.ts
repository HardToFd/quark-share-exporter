import type { LocalEntry, LocalFolderRule } from '../types/desktop'

export interface LocalFolderRuleMetric {
  maxDepth: number
  cumulativeCounts: number[]
}

export function selectLocalShareEntries(
  roots: string[],
  entries: LocalEntry[],
  folderRules: LocalFolderRule[]
): LocalEntry[] {
  const rootKeys = new Set(roots.map(localPathKey))
  const selected = new Map<string, LocalEntry>()
  const ruleByPath = new Map(folderRules.map((rule) => [localPathKey(rule.path), rule]))

  for (const entry of entries) {
    if (entry.kind === 'file' && rootKeys.has(localPathKey(entry.path))) {
      selected.set(localPathKey(entry.path), entry)
    }
  }

  for (const entry of entries) {
    if (entry.kind !== 'folder') continue
    walkLocalAncestors(entry.path, (ancestorKey, relativeDepth) => {
      const rule = ruleByPath.get(ancestorKey)
      if (!rule) return false
      if (rule.maxDepth !== null && relativeDepth > rule.maxDepth) return false
      selected.set(localPathKey(entry.path), entry)
      return true
    })
  }

  return [...selected.values()].sort(compareLocalEntries)
}

export function buildLocalFolderRuleMetrics(entries: LocalEntry[]): Map<string, LocalFolderRuleMetric> {
  const working = new Map<string, number[]>()
  for (const entry of entries) {
    if (entry.kind === 'folder') working.set(localPathKey(entry.path), [])
  }

  for (const entry of entries) {
    if (entry.kind !== 'folder') continue
    walkLocalAncestors(entry.path, (ancestorKey, relativeDepth) => {
      const counts = working.get(ancestorKey)
      if (!counts) return false
      counts[relativeDepth] = (counts[relativeDepth] ?? 0) + 1
      return false
    })
  }

  return new Map([...working].map(([key, counts]) => {
    let total = 0
    const cumulativeCounts = Array.from({ length: counts.length }, (_, depth) => {
      total += counts[depth] ?? 0
      return total
    })
    return [key, { maxDepth: Math.max(0, counts.length - 1), cumulativeCounts }]
  }))
}

export function countLocalFolderRule(
  entries: LocalEntry[],
  rule: LocalFolderRule
): number {
  let count = 0
  for (const entry of entries) {
    if (entry.kind !== 'folder') continue
    const relativeDepth = relativeLocalDepth(rule.path, entry.path)
    if (relativeDepth === null) continue
    if (rule.maxDepth === null || relativeDepth <= rule.maxDepth) count += 1
  }
  return count
}

export function maxLocalFolderDepth(entries: LocalEntry[], path: string): number {
  let maxDepth = 0
  for (const entry of entries) {
    if (entry.kind !== 'folder') continue
    const relativeDepth = relativeLocalDepth(path, entry.path)
    if (relativeDepth !== null) maxDepth = Math.max(maxDepth, relativeDepth)
  }
  return maxDepth
}

export function relativeLocalDepth(parentPath: string, candidatePath: string): number | null {
  const parent = localPathSegments(parentPath)
  const candidate = localPathSegments(candidatePath)
  if (candidate.length < parent.length) return null

  const caseInsensitive = isWindowsPath(parentPath) || isWindowsPath(candidatePath)
  for (let index = 0; index < parent.length; index += 1) {
    const left = caseInsensitive ? parent[index].toLocaleLowerCase() : parent[index]
    const right = caseInsensitive ? candidate[index].toLocaleLowerCase() : candidate[index]
    if (left !== right) return null
  }
  return candidate.length - parent.length
}

export function localPathKey(path: string): string {
  const caseInsensitive = isWindowsPath(path)
  const normalized = normalizeLocalPath(path)
  return caseInsensitive ? normalized.toLocaleLowerCase() : normalized
}

function normalizeLocalPath(path: string): string {
  const unc = /^[\\/]{2}/.test(path)
  let normalized = path.replace(/\\/g, '/').replace(/\/{2,}/g, '/')
  if (unc) normalized = `//${normalized.replace(/^\/+/, '')}`
  if (normalized === '/') return normalized
  return normalized.replace(/\/$/, '')
}

function localPathSegments(path: string): string[] {
  return normalizeLocalPath(path).split('/').filter(Boolean)
}

function isWindowsPath(path: string): boolean {
  return /^[a-z]:[\\/]/i.test(path) || /^[\\/]{2}/.test(path)
}

function walkLocalAncestors(
  path: string,
  visit: (ancestorKey: string, relativeDepth: number) => boolean
): void {
  let current = normalizeLocalPath(path)
  let relativeDepth = 0
  while (current) {
    if (visit(localPathKey(current), relativeDepth)) return
    const parent = parentLocalPath(current)
    if (!parent || parent === current) return
    current = parent
    relativeDepth += 1
  }
}

function parentLocalPath(path: string): string {
  const normalized = normalizeLocalPath(path)
  const separator = normalized.lastIndexOf('/')
  if (separator < 0) return ''
  if (separator === 0) return normalized === '/' ? '' : '/'
  if (normalized.startsWith('//') && separator === 1) return ''
  return normalized.slice(0, separator)
}

function compareLocalEntries(left: LocalEntry, right: LocalEntry): number {
  const rootOrder = localPathKey(left.rootPath).localeCompare(localPathKey(right.rootPath))
  if (rootOrder !== 0) return rootOrder
  if (left.depth !== right.depth) return left.depth - right.depth
  return localPathKey(left.path).localeCompare(localPathKey(right.path))
}
