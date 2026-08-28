import { CloudCog, File, FilePlus2, Folder, FolderOpen, FolderSearch, LoaderCircle, Search, Trash2, TriangleAlert } from 'lucide-react'
import { Badge, Button, Field, Input, Segmented } from '../../../shared/ui/Primitives'
import { formatBytes } from '../../../shared/lib/format'
import { localPathKey } from '../../../shared/lib/localFolderRules'
import type { LocalEntry, UploadTarget } from '../../../shared/types/desktop'
import type { WorkspaceModel } from '../model/useWorkspaceModel'
import { CloudDriveBrowser } from './CloudDriveBrowser'
import { StepCard } from './StepCard'

export function SourceSection({ model }: { model: WorkspaceModel }): React.JSX.Element {
  const localFiles = model.localSelection.entries.filter((entry) => entry.kind === 'file')
  const localBytes = localFiles.reduce((sum, entry) => sum + entry.size, 0)
  const entryByPath = new Map(model.localSelection.entries.map((entry) => [localPathKey(entry.path), entry]))
  const localRoots = model.localSelection.roots.flatMap((root) => {
    const entry = entryByPath.get(localPathKey(root))
    return entry ? [entry] : []
  })

  return (
    <StepCard
      step={1}
      title="选择数据来源"
      description="上传本机文件，或加载网盘项目后直接浏览并选择递归根目录。"
      aside={<Badge tone="accent">{model.sourceMode === 'local' ? '本机 → 网盘' : '网盘目录'}</Badge>}
    >
      <Segmented
        value={model.sourceMode}
        onChange={model.setSourceMode}
        disabled={model.running}
        options={[
          { value: 'local', label: '本机批量上传', description: '上传后直接使用返回 FID' },
          { value: 'cloud', label: '网盘指定目录', description: '全盘浏览 + 搜索定位' }
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
              <strong>{localRoots.length}</strong> 个入口 · {localFiles.length} 个文件 · {formatBytes(localBytes)}
            </div>
          </div>

          <UploadTargetEditor target={model.uploadTarget} onChange={model.setUploadTarget} disabled={model.running} />

          {model.localSelection.skippedSymlinks > 0 && (
            <div className="inline-alert inline-alert--warning">
              <TriangleAlert size={16} /> 已跳过 {model.localSelection.skippedSymlinks} 个符号链接，避免循环目录。
            </div>
          )}
          <LocalRootList roots={localRoots} entries={model.localSelection.entries} />
        </div>
      ) : (
        <div className="source-pane">
          <div className="cloud-load-row">
            <Button onClick={() => void model.loadCloudDrive()} disabled={model.busy === 'scan' || model.running || !model.account.authenticated}>
              {model.busy === 'scan' ? <LoaderCircle size={16} className="spin" /> : <CloudCog size={16} />}
              加载网盘
            </Button>
            <span>先读取网盘根目录；展开文件夹时按层加载直接子项，不再一次铺开全部后代。</span>
          </div>
          <div className="cloud-search">
            <Field label="按关键词补充定位" hint="输入目录名或文件名重新扫描；工具读取完整 artifact，不只使用 5 条预览。">
              <div className="input-action">
                <Input
                  value={model.cloudQuery}
                  onChange={(event) => model.setCloudQuery(event.target.value)}
                  placeholder="例如：项目交付资料"
                  maxLength={50}
                  disabled={model.running}
                />
                <Button onClick={() => void model.scanCloud()} disabled={!model.cloudQuery.trim() || model.busy === 'scan' || model.running}>
                  {model.busy === 'scan' ? <LoaderCircle size={16} className="spin" /> : <Search size={16} />}
                  搜索
                </Button>
              </div>
            </Field>
          </div>

          {model.cloudScan ? (
            <>
              <div className="scan-result-bar">
                <div>
                  <CloudCog size={17} />
                  <span>{model.cloudScan.message}</span>
                </div>
                <div className="scan-result-bar__badges">
                  <Badge tone={model.cloudScan.artifactAvailable ? 'success' : 'warning'}>
                    {model.cloudScan.artifactAvailable ? `${model.cloudScan.returned} 项已加载` : '仅 5 项预览'}
                  </Badge>
                  {model.cloudScan.truncated && <Badge tone="danger">仅加载 {model.cloudScan.returned} / {model.cloudScan.total}</Badge>}
                </div>
              </div>

              {model.cloudScan.checkAllLink && <div className="cloud-external-link"><Button variant="ghost" onClick={() => void model.openExternal(model.cloudScan!.checkAllLink!)}><FolderSearch size={16} /> 在夸克网盘中查看本次结果</Button></div>}
              {model.cloudScan.browseHint && <p className="browse-hint">{model.cloudScan.browseHint}</p>}
            </>
          ) : model.cloudRootLoaded ? (
            <div className="scan-result-bar">
              <div><CloudCog size={17} /><span>{model.cloudBrowseMessage}</span></div>
              <Badge tone="success">按层懒加载</Badge>
            </div>
          ) : null}

          {model.cloudItems.length > 0 || model.cloudRootLoaded ? (
            <CloudDriveBrowser
              items={model.cloudItems}
              total={model.cloudScan?.total ?? model.cloudItems.length}
              truncated={model.cloudScan?.truncated ?? false}
              hierarchical={model.cloudRootLoaded || model.cloudLoadedFolderFids.size > 0}
              selectedFid={model.cloudRootFid}
              disabled={model.running || model.busy === 'scan'}
              loadedFolderFids={model.cloudLoadedFolderFids}
              loadingFolderFids={model.cloudLoadingFolderFids}
              onSelect={model.setCloudRootFid}
              onExpand={model.loadCloudFolder}
            />
          ) : null}
        </div>
      )}
    </StepCard>
  )
}

function LocalRootList({ roots, entries }: { roots: LocalEntry[]; entries: LocalEntry[] }): React.JSX.Element {
  if (roots.length === 0) {
    return <div className="empty-state"><FolderSearch size={22} /><span>还没有选择本机入口。可混合添加多个文件和文件夹。</span></div>
  }

  return (
    <div className="local-root-list">
      <div className="local-root-list__head">
        <span>已选入口</span>
        <span>上传内容</span>
        <span>默认打链</span>
      </div>
      {roots.map((root) => {
        const descendants = entries.filter((entry) => localPathKey(entry.rootPath) === localPathKey(root.path))
        const files = descendants.filter((entry) => entry.kind === 'file')
        const folders = descendants.filter((entry) => entry.kind === 'folder')
        const bytes = files.reduce((sum, entry) => sum + entry.size, 0)
        return (
          <div className="local-root-list__row" key={localPathKey(root.path)}>
            <span className={`local-root-list__icon is-${root.kind}`}>
              {root.kind === 'folder' ? <Folder size={17} /> : <File size={17} />}
            </span>
            <div className="local-root-list__identity">
              <strong>{root.name}</strong>
              <span title={root.path}>{root.path}</span>
            </div>
            <span className="local-root-list__contents">
              {root.kind === 'folder'
                ? `${Math.max(0, folders.length - 1)} 个子目录 · ${files.length} 个文件 · ${formatBytes(bytes)}`
                : formatBytes(root.size)}
            </span>
            <Badge tone={root.kind === 'folder' ? 'accent' : 'neutral'}>
              {root.kind === 'folder' ? '根目录 1 条' : '文件 1 条'}
            </Badge>
          </div>
        )
      })}
      <div className="local-root-list__note">文件夹内部会保持原目录结构上传；只有步骤 2 选中的目录节点会生成分享链。</div>
    </div>
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
      <Field label="上传目标目录" hint="QuarkLink 自定义 Agent 没有官方默认上传目录，请明确选择根目录或填写目录 FID。">
        <select
          className="select"
          value={target.mode}
          onChange={(event) => {
            const mode = event.target.value
            onChange(mode === 'fid' ? { mode: 'fid', fid: '' } : { mode } as UploadTarget)
          }}
          disabled={disabled}
        >
          <option value="default" disabled>请选择上传目标目录</option>
          <option value="root">上传到网盘根目录</option>
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
