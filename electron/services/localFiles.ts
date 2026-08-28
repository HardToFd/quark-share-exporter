import { lstat, readdir } from 'node:fs/promises'
import { basename, join, relative } from 'node:path'
import { dialog } from 'electron'
import type { InterfaceLocale, LocalEntry, LocalSelection } from '../../src/shared/types/desktop'

export async function pickLocalEntries(kind: 'files' | 'folder', locale: InterfaceLocale): Promise<LocalSelection | null> {
  const english = locale === 'en'
  const result = await dialog.showOpenDialog({
    title: kind === 'folder'
      ? (english ? 'Choose folders to upload' : '选择要上传的文件夹')
      : (english ? 'Choose files to upload' : '选择要上传的文件'),
    buttonLabel: english ? 'Add to task' : '添加到任务',
    properties:
      kind === 'folder'
        ? ['openDirectory', 'multiSelections']
        : ['openFile', 'multiSelections']
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return inventoryPaths(result.filePaths)
}

export async function inventoryPaths(roots: string[]): Promise<LocalSelection> {
  const entries: LocalEntry[] = []
  let skippedSymlinks = 0

  for (const root of roots) {
    const rootStats = await lstat(root)
    if (rootStats.isSymbolicLink()) {
      skippedSymlinks += 1
      continue
    }

    if (rootStats.isFile()) {
      entries.push({
        path: root,
        rootPath: root,
        name: basename(root),
        kind: 'file',
        size: rootStats.size,
        relativePath: basename(root),
        depth: 0
      })
      continue
    }

    if (!rootStats.isDirectory()) continue
    const rootName = basename(root)
    entries.push({
      path: root,
      rootPath: root,
      name: rootName,
      kind: 'folder',
      size: 0,
      relativePath: rootName,
      depth: 0
    })

    const queue = [root]
    while (queue.length > 0) {
      const directory = queue.shift()!
      const children = await readdir(directory, { withFileTypes: true })
      for (const child of children) {
        const absolutePath = join(directory, child.name)
        const stats = await lstat(absolutePath)
        if (stats.isSymbolicLink()) {
          skippedSymlinks += 1
          continue
        }

        const childRelative = relative(root, absolutePath).replace(/\\/g, '/')
        const relativePath = `${rootName}/${childRelative}`
        const depth = childRelative.split('/').filter(Boolean).length
        if (stats.isDirectory()) {
          entries.push({
            path: absolutePath,
            rootPath: root,
            name: child.name,
            kind: 'folder',
            size: 0,
            relativePath,
            depth
          })
          queue.push(absolutePath)
        } else if (stats.isFile()) {
          entries.push({
            path: absolutePath,
            rootPath: root,
            name: child.name,
            kind: 'file',
            size: stats.size,
            relativePath,
            depth
          })
        }
      }
    }
  }

  return { roots, entries, skippedSymlinks }
}
