import type { CloudEntry, ScopeSettings } from '../../../shared/types/desktop'

export function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/^\/+|\/+$/g, '')
}

export function rebaseCloudItems(items: CloudEntry[], rootFid: string): CloudEntry[] {
  if (!rootFid) return items
  const byFid = new Map(items.map((item) => [item.fid, item]))

  return items.flatMap((item) => {
    const chain = [...(item.ancestorFids ?? []), item.fid]
    const rootIndex = chain.indexOf(rootFid)
    if (rootIndex === -1) return []
    if (item.fid === rootFid) return [{ ...item, relativePath: '', depth: 0 }]
    const relativeFids = chain.slice(rootIndex + 1)
    const relativePath = relativeFids
      .flatMap((fid) => {
        const entry = byFid.get(fid)
        return entry ? [entry.name] : []
      })
      .join('/') || item.name
    return [{ ...item, relativePath, depth: relativeFids.length }]
  })
}

export function mergeCloudEntries(current: CloudEntry[], incoming: CloudEntry[]): CloudEntry[] {
  if (incoming.length === 0) return current
  const entries = new Map(current.map((item) => [item.fid, item]))
  for (const item of incoming) entries.set(item.fid, item)
  return [...entries.values()]
}

export function countScopedItems(
  items: Array<{ kind: 'file' | 'folder'; depth: number }>,
  scope: ScopeSettings
): number {
  return items.filter((item) => {
    if (!scope.includeRoot && item.depth === 0) return false
    if (scope.maxDepth !== null && item.depth > scope.maxDepth) return false
    return item.kind === 'file' ? scope.includeFiles : scope.includeFolders
  }).length
}
