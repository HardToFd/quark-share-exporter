import { describe, expect, it } from 'vitest'
import { mapUploadSuccesses, normalizeCloudItems, selectByScope } from './quarkData'

describe('cloud item normalization', () => {
  it('filters by exact path prefix and computes depth', () => {
    const items = normalizeCloudItems(
      [
        { fid: 'root', filename: '资料', file_type: '0', category: 0, path: '夸克网盘/资料' },
        { fid: 'a', filename: 'a.pdf', file_type: '1', category: 4, path: '夸克网盘/资料' },
        { fid: 'b', filename: 'b.pdf', file_type: '1', category: 4, path: '夸克网盘/资料/二级' },
        { fid: 'x', filename: 'x.pdf', file_type: '1', category: 4, path: '夸克网盘/其他' }
      ],
      '夸克网盘/资料'
    )

    expect(items.map((item) => [item.fid, item.depth])).toEqual([
      ['root', 0],
      ['a', 1],
      ['b', 2]
    ])
  })

  it('applies depth and type scope', () => {
    const selected = selectByScope(
      [
        { kind: 'folder' as const, depth: 0 },
        { kind: 'file' as const, depth: 1 },
        { kind: 'folder' as const, depth: 1 },
        { kind: 'file' as const, depth: 2 }
      ],
      { maxDepth: 1, includeRoot: false, includeFiles: true, includeFolders: false }
    )
    expect(selected).toEqual([{ kind: 'file', depth: 1 }])
  })
})

describe('upload mapping', () => {
  it('marks duplicate name and size matches as ambiguous', () => {
    const mapped = mapUploadSuccesses(
      [
        { path: 'C:/a/report.pdf', name: 'report.pdf', kind: 'file', size: 10, relativePath: 'a/report.pdf', depth: 2 },
        { path: 'C:/b/report.pdf', name: 'report.pdf', kind: 'file', size: 10, relativePath: 'b/report.pdf', depth: 2 }
      ],
      [
        { fid: '1', fileName: 'report.pdf', fileSize: 10 },
        { fid: '2', fileName: 'report.pdf', fileSize: 10 }
      ]
    )
    expect(mapped.map((item) => item.mappingConfidence)).toEqual(['ambiguous', 'ambiguous'])
  })
})
