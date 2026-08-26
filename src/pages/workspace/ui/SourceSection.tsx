import { CloudCog, FilePlus2, FolderOpen, FolderSearch, LoaderCircle, Search, Trash2, TriangleAlert } from 'lucide-react'
import { Badge, Button, Field, Input, Segmented } from '../../../shared/ui/Primitives'
import { fileNameFromPath, formatBytes, formatDateTime } from '../../../shared/lib/format'
import type { UploadTarget } from '../../../shared/types/desktop'
import type { WorkspaceModel } from '../model/useWorkspaceModel'
import { StepCard } from './StepCard'

export function SourceSection({ model }: { model: WorkspaceModel }): React.JSX.Element {
  const localFiles = model.localSelection.entries.filter((entry) => entry.kind === 'file')
  const localBytes = localFiles.reduce((sum, entry) => sum + entry.size, 0)

  return (
    <StepCard
      step={1}
      title="选择数据来源"
      description="上传本机文件，或从网盘检索 artifact 中选择指定目录范围。"
      aside={<Badge tone="accent">{model.sourceMode === 'local' ? '本机 → 网盘' : '网盘目录'}</Badge>}
    >
      <Segmented
        value={model.sourceMode}
        onChange={model.setSourceMode}
        disabled={model.running}
        options={[
          { value: 'local', label: '本机批量上传', description: '上传后直接使用返回 FID' },
          { value: 'cloud', label: '网盘指定目录', description: '一次搜索 + 路径树筛选' }
        ]}
      />

      {model.sourceMode === 'local' ? (
        <div className="source-pane">
          <div className="source-actions">
            <Button variant="secondary" onClick={() => void model.addLocal('files')} disabled={model.busy === 'local' || model.running}>
              {model.busy === 'local' ? <LoaderCircle size={16} className="spin" /> : <FilePlus2 size={16} />}
              添加文件
            </Button>
            <Button variant="secondary" onClick={() => void model.addLocal('folder')} disabled={model.busy === 'local' || model.running}>
              <FolderOpen size={16} /> 添加文件夹
            </Button>
            {model.localSelection.entries.length > 0 && (
              <Button variant="ghost" onClick={model.clearLocal} disabled={model.running}>
                <Trash2 size={15} /> 清空
              </Button>
            )}
            <div className="source-summary">
              <strong>{localFiles.length}</strong> 个文件 · {formatBytes(localBytes)}
            </div>
          </div>

          <UploadTargetEditor target={model.uploadTarget} onChange={model.setUploadTarget} disabled={model.running} />

          {model.localSelection.skippedSymlinks > 0 && (
            <div className="inline-alert inline-alert--warning">
              <TriangleAlert size={16} /> 已跳过 {model.localSelection.skippedSymlinks} 个符号链接，避免循环目录。
            </div>
          )}
          <PreviewTable
            rows={localFiles.slice(0, 7).map((entry) => ({
              name: entry.name,
              path: entry.relativePath,
              meta: formatBytes(entry.size),
              depth: entry.depth
            }))}
            empty="还没有选择本机文件。可混合添加多个文件和文件夹。"
            total={localFiles.length}
          />
        </div>
      ) : (
        <div className="source-pane">
          <div className="cloud-search">
            <Field label="目录名称或位置描述" hint="官方 search 单次最多返回 3000 条；工具读取完整 artifact，不使用 5 条预览。">
              <div className="input-action">
                <Input
                  value={model.cloudQuery}
                  onChange={(event) => model.setCloudQuery(event.target.value)}
                  placeholder="例如：夸克网盘/项目交付资料 下所有文件"
                  maxLength={50}
                  disabled={model.running}
                />
                <Button onClick={() => void model.scanCloud()} disabled={!model.cloudQuery.trim() || model.busy === 'scan' || model.running}>
                  {model.busy === 'scan' ? <LoaderCircle size={16} className="spin" /> : <Search size={16} />}
                  扫描
                </Button>
              </div>
            </Field>
          </div>

          {model.cloudScan && (
            <>
              <div className="scan-result-bar">
                <div>
                  <CloudCog size={17} />
                  <span>{model.cloudScan.message}</span>
                </div>
                <div className="scan-result-bar__badges">
                  <Badge tone={model.cloudScan.artifactAvailable ? 'success' : 'warning'}>
                    {model.cloudScan.artifactAvailable ? '完整 artifact' : '仅预览数据'}
                  </Badge>
                  {model.cloudScan.truncated && <Badge tone="danger">触及 3000 上限</Badge>}
                </div>
              </div>

              <Field label="作为递归根目录" hint="选择后只保留该路径本身及其后代，并重新计算相对深度。">
                <div className="input-action">
                  <select
                    className="select"
                    value={model.cloudRootPath}
                    onChange={(event) => model.setCloudRootPath(event.target.value)}
                    disabled={model.running}
                  >
                    <option value="">全部匹配结果（不限定目录）</option>
                    {model.cloudScan.folderCandidates.slice(0, 500).map((folder) => (
                      <option key={folder.fid} value={folder.fullPath}>{folder.fullPath}</option>
                    ))}
                  </select>
                  {model.cloudScan.checkAllLink && (
                    <Button variant="ghost" onClick={() => void model.openExternal(model.cloudScan!.checkAllLink!)}>
                      <FolderSearch size={16} /> 网盘中查看
                    </Button>
                  )}
                </div>
              </Field>
              {model.cloudScan.browseHint && <p className="browse-hint">{model.cloudScan.browseHint}</p>}

              <PreviewTable
                rows={model.effectiveCloudItems.slice(0, 7).map((entry) => ({
                  name: entry.name,
                  path: entry.relativePath || entry.fullPath,
                  meta: entry.kind === 'folder' ? '文件夹' : `${formatBytes(entry.size)} · ${formatDateTime(entry.updatedAt)}`,
                  depth: entry.depth
                }))}
                empty="当前目录路径下没有匹配项目。请选择其他递归根目录。"
                total={model.effectiveCloudItems.length}
              />
            </>
          )}
        </div>
      )}
    </StepCard>
  )
}

function UploadTargetEditor({
  target,
  onChange,
  disabled
}: {
  target: UploadTarget
  onChange: (target: UploadTarget) => void
  disabled: boolean
}): React.JSX.Element {
  return (
    <div className="target-editor">
      <Field label="上传目标目录" hint="未指定时不传 parent-fid，由官方 CLI 决定默认目录；只有明确选择根目录时才传 0。">
        <select
          className="select"
          value={target.mode}
          onChange={(event) => {
            const mode = event.target.value
            onChange(mode === 'fid' ? { mode: 'fid', fid: '' } : { mode } as UploadTarget)
          }}
          disabled={disabled}
        >
          <option value="default">Skill 默认目录（推荐）</option>
          <option value="root">明确上传到根目录</option>
          <option value="fid">指定目录 FID</option>
        </select>
      </Field>
      {target.mode === 'fid' && (
        <Field label="目标目录 FID">
          <Input value={target.fid} onChange={(event) => onChange({ mode: 'fid', fid: event.target.value })} placeholder="粘贴目录 FID" disabled={disabled} />
        </Field>
      )}
    </div>
  )
}

function PreviewTable({
  rows,
  empty,
  total
}: {
  rows: Array<{ name: string; path: string; meta: string; depth: number }>
  empty: string
  total: number
}): React.JSX.Element {
  if (rows.length === 0) return <div className="empty-state"><FolderSearch size={22} /><span>{empty}</span></div>
  return (
    <div className="preview-table">
      <div className="preview-table__head"><span>项目</span><span>路径</span><span>信息</span><span>深度</span></div>
      {rows.map((row, index) => (
        <div className="preview-table__row" key={`${row.path}-${index}`}>
          <strong>{row.name || fileNameFromPath(row.path)}</strong>
          <span title={row.path}>{row.path}</span>
          <span>{row.meta}</span>
          <Badge tone="neutral">L{row.depth}</Badge>
        </div>
      ))}
      {total > rows.length && <div className="preview-table__more">另有 {total - rows.length} 项将在任务中处理</div>}
    </div>
  )
}
