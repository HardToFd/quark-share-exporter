import { describe, expect, it } from 'vitest'
import type { LocalEntry } from '../types/desktop'
import {
  buildLocalFolderRuleMetrics,
  countLocalFolderRule,
  maxLocalFolderDepth,
  relativeLocalDepth,
  selectLocalShareEntries
} from './localFolderRules'

const entries: LocalEntry[] = [
  folder('C:/Work/Parent', 'C:/Work/Parent', 'Parent', 0),
  folder('C:/Work/Parent/A', 'C:/Work/Parent', 'A', 1),
  file('C:/Work/Parent/A/a.txt', 'C:/Work/Parent', 'a.txt', 2),
  folder('C:/Work/Parent/A/deep', 'C:/Work/Parent', 'deep', 2),
  folder('C:/Work/Parent/B', 'C:/Work/Parent', 'B', 1),
  file('C:/Loose.txt', 'C:/Loose.txt', 'Loose.txt', 0)
]

describe('local folder sharing rules', () => {
  it('defaults a folder rule at L0 to one folder link instead of every file', () => {
    const selected = selectLocalShareEntries(
      ['C:/Work/Parent'],
      entries,
      [{ path: 'C:/Work/Parent', maxDepth: 0 }]
    )

    expect(selected.map((entry) => entry.path)).toEqual(['C:/Work/Parent'])
  })

  it('applies independent recursive depths and de-duplicates overlapping folders', () => {
    const selected = selectLocalShareEntries(
      ['C:/Work/Parent'],
      entries,
      [
        { path: 'C:/Work/Parent', maxDepth: 1 },
        { path: 'C:/Work/Parent/A', maxDepth: 1 }
      ]
    )

    expect(selected.map((entry) => entry.name)).toEqual(['Parent', 'A', 'B', 'deep'])
  })

  it('keeps explicitly added files as individual links', () => {
    const selected = selectLocalShareEntries(['C:/Loose.txt'], entries, [])
    expect(selected.map((entry) => entry.path)).toEqual(['C:/Loose.txt'])
  })

  it('computes available depth and Windows paths case-insensitively', () => {
    expect(relativeLocalDepth('c:/work/parent/a', 'C:/Work/Parent/A/deep')).toBe(1)
    expect(relativeLocalDepth('\\\\SERVER\\Share', '\\\\server\\share\\Folder')).toBe(1)
    expect(maxLocalFolderDepth(entries, 'C:/Work/Parent')).toBe(2)
    expect(countLocalFolderRule(entries, { path: 'C:/Work/Parent/A', maxDepth: null })).toBe(2)
    expect(buildLocalFolderRuleMetrics(entries).get('c:/work/parent')).toEqual({
      maxDepth: 2,
      cumulativeCounts: [1, 3, 4]
    })
  })
})

function folder(path: string, rootPath: string, name: string, depth: number): LocalEntry {
  return { path, rootPath, name, kind: 'folder', size: 0, relativePath: name, depth }
}

function file(path: string, rootPath: string, name: string, depth: number): LocalEntry {
  return { path, rootPath, name, kind: 'file', size: 10, relativePath: name, depth }
}
