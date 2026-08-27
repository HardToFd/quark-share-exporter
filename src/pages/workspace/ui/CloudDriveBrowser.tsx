import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { ChevronDown, ChevronRight, File, Folder, FolderCheck, GitBranch, LoaderCircle, Search, X } from 'lucide-react'
import { formatBytes, formatDateTime } from '../../../shared/lib/format'
import type { CloudEntry } from '../../../shared/types/desktop'
import { Badge, Button, Input } from '../../../shared/ui/Primitives'

const PAGE_SIZE = 250

interface CloudTreeRow {
  item: CloudEntry
  treeDepth: number
}

export function CloudDriveBrowser({
  items,
  total,
  truncated,
  hierarchical,
  selectedFid,
  disabled,
  loadedFolderFids,
  loadingFolderFids,
  onSelect,
  onExpand
}: {
  items: CloudEntry[]
  total: number
  truncated: boolean
  hierarchical: boolean
  selectedFid: string
  disabled: boolean
  loadedFolderFids: Set<string>
  loadingFolderFids: Set<string>
  onSelect: (fid: string) => void
  onExpand: (fid: string) => Promise<CloudEntry[]>
}): React.JSX.Element {
  const [filter, setFilter] = useState('')
  const [expandedFids, setExpandedFids] = useState<Set<string>>(() => new Set())
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE)
  const selected = useMemo(() => items.find((item) => item.fid === selectedFid), [items, selectedFid])
  const tree = useMemo(() => buildCloudTree(items), [items])
  const visibleRows = useMemo(() => {
    const query = filter.trim().toLocaleLowerCase()
    if (!hierarchical || query) {
      return sortCloudEntries(items
        .filter((item) => !query || item.name.toLocaleLowerCase().includes(query) || item.fullPath.toLocaleLowerCase().includes(query)))
        .map((item) => ({ item, treeDepth: hierarchical ? Math.min(item.depth, 8) : 0 }))
    }

    const rows: CloudTreeRow[] = []
    const visited = new Set<string>()
    const visit = (entry: CloudEntry, treeDepth: number): void => {
      if (visited.has(entry.fid)) return
      visited.add(entry.fid)
      rows.push({ item: entry, treeDepth })
      if (entry.kind !== 'folder' || !expandedFids.has(entry.fid)) return
      for (const child of tree.childrenByParent.get(entry.fid) ?? []) visit(child, treeDepth + 1)
    }
    for (const entry of tree.roots) visit(entry, 0)
    return rows
  }, [expandedFids, filter, hierarchical, items, tree])

  useEffect(() => setVisibleLimit(PAGE_SIZE), [expandedFids, filter, items])

  const toggleFolder = (item: CloudEntry): void => {
    const opening = !expandedFids.has(item.fid)
    setExpandedFids((current) => {
      const next = new Set(current)
      if (next.has(item.fid)) next.delete(item.fid)
      else next.add(item.fid)
      return next
    })
    if (opening && !loadedFolderFids.has(item.fid) && !loadingFolderFids.has(item.fid)) {
      void onExpand(item.fid).catch(() => undefined)
    }
  }

  return (
    <div className="cloud-browser">
      <div className="cloud-browser__toolbar">
        <div className="cloud-browser__filter">
          <Search size={15} />
          <Input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="筛选已经加载的目录节点" disabled={disabled} />
          {filter ? <button type="button" onClick={() => setFilter('')} aria-label="清除筛选"><X size={14} /></button> : null}
        </div>
        <div className="cloud-browser__counts">
          <Badge tone={truncated ? 'warning' : 'success'}>
            {truncated ? `${items.length} / ${total} 项` : `${items.length} 个已加载节点`}
          </Badge>
          {hierarchical ? <span className="cloud-browser__tree-mode"><GitBranch size={12} /> 树形层级</span> : null}
          <span>{tree.folderCount} 个文件夹</span>
        </div>
      </div>

      {selected ? (
        <div className="cloud-browser__selection">
          <FolderCheck size={17} />
          <div><strong>递归根目录：{selected.name}</strong><span>{selected.fullPath}</span></div>
          <Button variant="ghost" onClick={() => onSelect('')} disabled={disabled}>取消选择</Button>
        </div>
      ) : null}

      <div className="cloud-browser__table">
        <div className="cloud-browser__head"><span>项目</span><span>网盘位置</span><span>信息</span><span>操作</span></div>
        <div className="cloud-browser__body">
          {visibleRows.slice(0, visibleLimit).map(({ item, treeDepth }) => {
            const loaded = loadedFolderFids.has(item.fid)
            const loading = loadingFolderFids.has(item.fid)
            const childCount = tree.childrenByParent.get(item.fid)?.length ?? 0
            const style = { '--cloud-depth': Math.min(treeDepth, 8) } as CSSProperties
            return (
              <div
                className={`cloud-browser__row ${treeDepth > 0 ? 'is-nested' : 'is-root-level'} ${item.fid === selectedFid ? 'is-selected' : ''}`}
                key={item.fid}
                style={style}
              >
                <div className="cloud-browser__tree-cell">
                  {item.kind === 'folder' ? (
                    <button
                      type="button"
                      className="cloud-browser__tree-toggle"
                      onClick={() => toggleFolder(item)}
                      disabled={disabled}
                      aria-expanded={expandedFids.has(item.fid)}
                      aria-label={`${expandedFids.has(item.fid) ? '收起' : '展开'} ${item.name}`}
                    >
                      {loading ? <LoaderCircle size={14} className="spin" /> : expandedFids.has(item.fid) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                  ) : <span className="cloud-browser__tree-spacer" aria-hidden="true" />}
                  <span className={`cloud-browser__icon is-${item.kind}`}>
                    {item.kind === 'folder' ? <Folder size={17} /> : <File size={16} />}
                  </span>
                  <div className="cloud-browser__identity">
                    <strong>{item.name}</strong>
                    <span>{item.kind === 'folder' ? loaded ? `已加载 ${childCount} 个直接子项` : '展开时加载下一层' : formatBytes(item.size)}</span>
                  </div>
                  <span className="cloud-browser__level" title={`网盘目录树第 ${treeDepth} 层`}>L{treeDepth}</span>
                </div>
                <span className="cloud-browser__path" title={item.fullPath}>{item.fullPath}</span>
                <span className="cloud-browser__meta">{item.updatedAt ? formatDateTime(item.updatedAt) : '—'}</span>
                {item.kind === 'folder'
                  ? <Button variant="ghost" onClick={() => onSelect(item.fid)} disabled={disabled}>{item.fid === selectedFid ? '已选根目录' : '选为根目录'}</Button>
                  : <span className="cloud-browser__file-mark">文件</span>}
              </div>
            )
          })}
          {visibleRows.length === 0 ? <div className="cloud-browser__empty">当前层没有项目</div> : null}
        </div>
        {visibleRows.length > visibleLimit ? (
          <button className="cloud-browser__more" type="button" onClick={() => setVisibleLimit((current) => current + PAGE_SIZE)}>
            继续显示 {Math.min(PAGE_SIZE, visibleRows.length - visibleLimit)} 项 · 尚有 {visibleRows.length - visibleLimit} 项
          </button>
        ) : null}
      </div>
    </div>
  )
}

function buildCloudTree(items: CloudEntry[]): {
  roots: CloudEntry[]
  childrenByParent: Map<string, CloudEntry[]>
  folderCount: number
} {
  const byFid = new Map(items.map((item) => [item.fid, item]))
  const childrenByParent = new Map<string, CloudEntry[]>()
  const roots: CloudEntry[] = []
  let folderCount = 0

  for (const item of items) {
    if (item.kind === 'folder') folderCount += 1
    if (!item.parentFid || item.parentFid === '0' || !byFid.has(item.parentFid)) {
      roots.push(item)
      continue
    }
    const children = childrenByParent.get(item.parentFid) ?? []
    children.push(item)
    childrenByParent.set(item.parentFid, children)
  }

  for (const [parentFid, children] of childrenByParent) childrenByParent.set(parentFid, sortCloudEntries(children))
  return { roots: sortCloudEntries(roots), childrenByParent, folderCount }
}

function sortCloudEntries(items: CloudEntry[]): CloudEntry[] {
  return [...items].sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === 'folder' ? -1 : 1
    return left.name.localeCompare(right.name, 'zh-CN', { numeric: true })
  })
}
