import type { CloudEntry, ScopeSettings } from '../../../shared/types/desktop'

export function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/^\/+|\/+$/g, '')
}

export function rebaseCloudItems(items: CloudEntry[], rootPath: string): CloudEntry[] {
  const root = normalizePath(rootPath)
  if (!root) return items

  return items.flatMap((item) => {
    const fullPath = normalizePath(item.fullPath)
    if (fullPath === root) return [{ ...item, relativePath: '', depth: 0 }]
    if (!fullPath.startsWith(`${root}/`)) return []
    const relativePath = fullPath.slice(root.length + 1)
    return [{ ...item, relativePath, depth: relativePath.split('/').filter(Boolean).length }]
  })
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
