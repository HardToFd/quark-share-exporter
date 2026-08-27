import { describe, expect, it } from 'vitest'
import type { CloudEntry } from '../../../shared/types/desktop'
import { mergeCloudEntries, rebaseCloudItems } from './workspaceData'

describe('rebaseCloudItems', () => {
  it('selects descendants by FID chain and recomputes depth', () => {
    const items = [
      entry('root', '根目录', []),
      entry('child', '子目录', ['root']),
      entry('file', '文档.pdf', ['root', 'child'], 'file')
    ]

    expect(rebaseCloudItems(items, 'child').map((item) => [item.fid, item.depth, item.relativePath])).toEqual([
      ['child', 0, ''],
      ['file', 1, '文档.pdf']
    ])
  })
})

describe('mergeCloudEntries', () => {
  it('keeps stable order while replacing known FIDs and appending new children', () => {
    const root = entry('root', '根目录', [])
    const child = entry('child', '旧名称', ['root'])
    const updatedChild = { ...child, name: '新名称', fullPath: '根目录/新名称' }
    const file = entry('file', '文档.pdf', ['root', 'child'], 'file')

    const merged = mergeCloudEntries([root, child], [updatedChild, file])

    expect(merged.map((item) => item.fid)).toEqual(['root', 'child', 'file'])
    expect(merged[1]).toMatchObject({ name: '新名称', fullPath: '根目录/新名称' })
  })
})

function entry(fid: string, name: string, ancestorFids: string[], kind: 'file' | 'folder' = 'folder'): CloudEntry {
  return { fid, name, kind, size: 0, ancestorFids, path: '', fullPath: name, relativePath: name, depth: ancestorFids.length }
}
