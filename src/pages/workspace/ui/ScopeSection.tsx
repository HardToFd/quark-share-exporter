import { useMemo, type CSSProperties } from 'react'
import { FileCheck2, Files, FolderTree, GitBranch, Link2 } from 'lucide-react'
import { Badge, Checkbox, Field } from '../../../shared/ui/Primitives'
import { buildLocalFolderRuleMetrics, localPathKey, type LocalFolderRuleMetric } from '../../../shared/lib/localFolderRules'
import type { LocalEntry, LocalFolderRule } from '../../../shared/types/desktop'
import type { WorkspaceModel } from '../model/useWorkspaceModel'
import { StepCard } from './StepCard'

export function ScopeSection({ model }: { model: WorkspaceModel }): React.JSX.Element {
  const isLocal = model.sourceMode === 'local'
  return (
    <StepCard
      step={2}
      title={isLocal ? '配置目录打链规则' : '定义递归范围'}
      description={
        isLocal
          ? '添加文件夹默认只分享所选根目录；每个子目录都能设置独立的向下递归深度。'
          : '选择根目录后自定义递归深度；L0 仅根目录，L1 表示直接子项。'
      }
      aside={<Badge tone="accent"><Files size={13} /> 将生成 {model.selectedCount} 条记录</Badge>}
    >
      {isLocal ? <LocalFolderScopeEditor model={model} /> : <CloudScopeEditor model={model} />}
    </StepCard>
  )
}

function LocalFolderScopeEditor({ model }: { model: WorkspaceModel }): React.JSX.Element {
  const folders = model.localSelection.entries.filter((entry) => entry.kind === 'folder')
  const directFiles = model.localShareEntries.filter((entry) => entry.kind === 'file')
  const ruleByPath = new Map(model.localFolderRules.map((rule) => [localPathKey(rule.path), rule]))
  const metricsByPath = useMemo(
    () => buildLocalFolderRuleMetrics(model.localSelection.entries),
    [model.localSelection.entries]
  )

  if (folders.length === 0) {
    return (
      <div className="local-scope-empty">
        <FileCheck2 size={20} />
        <div>
          <strong>{directFiles.length > 0 ? `${directFiles.length} 个显式添加的文件将逐个打链` : '尚未添加文件夹'}</strong>
          <span>使用“添加文件夹”后，这里会显示可独立配置的目录树。</span>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="folder-rule-callout">
        <span className="folder-rule-callout__icon"><Link2 size={18} /></span>
        <div>
          <strong>目录是分享对象，目录里的文件只是内容</strong>
          <span>“至 L1”会为该目录和它的直接子目录分别打链；多个规则重叠时只保留一个目录节点。</span>
        </div>
        {directFiles.length > 0 && <Badge tone="neutral">另有 {directFiles.length} 个单独文件</Badge>}
      </div>

      <div className="folder-rule-table">
        <div className="folder-rule-table__head">
          <span>目录节点</span>
          <span>该节点的递归规则</span>
          <span>规则命中</span>
        </div>
        <div className="folder-rule-table__body">
          {folders.map((folder) => (
            <FolderRuleRow
              key={localPathKey(folder.path)}
              folder={folder}
              metric={metricsByPath.get(localPathKey(folder.path))}
              rule={ruleByPath.get(localPathKey(folder.path))}
              disabled={model.running}
              onChange={(value) => model.setLocalFolderRule(folder.path, value)}
            />
          ))}
        </div>
        <div className="folder-rule-table__footer">
          <FolderTree size={15} />
          <span>默认只有所选父目录启用“仅此目录”；子目录不会自动拆成文件链接。</span>
        </div>
      </div>
    </>
  )
}

function FolderRuleRow({
  folder,
  metric,
  rule,
  disabled,
  onChange
}: {
  folder: LocalEntry
  metric?: LocalFolderRuleMetric
  rule?: LocalFolderRule
  disabled: boolean
  onChange: (value: number | null | 'off') => void
}): React.JSX.Element {
  const availableDepth = metric?.maxDepth ?? 0
  const value = rule ? rule.maxDepth ?? 'all' : 'off'
  const impact = rule
    ? metric?.cumulativeCounts[rule.maxDepth === null ? availableDepth : Math.min(rule.maxDepth, availableDepth)] ?? 0
    : 0
  const depthOptions = Array.from({ length: Math.min(availableDepth, 20) }, (_, index) => index + 1)
  const style = { '--folder-depth': Math.min(folder.depth, 8) } as CSSProperties

  return (
    <div className={`folder-rule-row ${rule ? 'is-active' : ''}`} style={style}>
      <div className="folder-rule-row__identity">
        <span className="folder-rule-row__branch"><GitBranch size={14} /></span>
        <span className="folder-rule-row__folder"><FolderTree size={16} /></span>
        <div>
          <strong>{folder.name}</strong>
          <span title={folder.path}>{folder.relativePath}</span>
        </div>
      </div>
      <select
        className="select folder-rule-row__select"
        value={value}
        onChange={(event) => {
          if (event.target.value === 'off') return onChange('off')
          if (event.target.value === 'all') return onChange(null)
          onChange(Number(event.target.value))
        }}
        disabled={disabled}
        aria-label={`${folder.name} 的递归打链深度`}
      >
        <option value="off">不为此分支打链</option>
        <option value="0">仅此目录（L0）</option>
        {depthOptions.map((depth) => (
          <option key={depth} value={depth}>此目录及向下 {depth} 层</option>
        ))}
        {availableDepth > 0 && <option value="all">包含全部后代目录</option>}
      </select>
      <Badge tone={rule ? 'accent' : 'neutral'}>{rule ? `${impact} 个目录` : '关闭'}</Badge>
    </div>
  )
}

function CloudScopeEditor({ model }: { model: WorkspaceModel }): React.JSX.Element {
  const root = model.selectedCloudRoot
  if (!root) {
    return (
      <div className="local-scope-empty">
        <FolderTree size={20} />
        <div>
          <strong>请先在上方选择一个文件夹作为根目录</strong>
          <span>选择后，这里会立即提供 L0、L1、L2…以及全部后代的递归深度选项。</span>
        </div>
      </div>
    )
  }

  const loadedDepth = model.effectiveCloudItems.reduce((maximum, item) => Math.max(maximum, item.depth), 0)
  const folderCount = model.effectiveCloudItems.filter((item) => item.kind === 'folder').length
  const fileCount = model.effectiveCloudItems.length - folderCount
  const selectedDepth = model.scope.maxDepth ?? 0
  const depthCeiling = Math.min(50, Math.max(10, loadedDepth, selectedDepth))
  const depthOptions = Array.from({ length: depthCeiling + 1 }, (_, depth) => depth)
  const disabled = model.running || model.busy === 'scan'

  return (
    <>
      <div className="folder-rule-callout">
        <span className="folder-rule-callout__icon"><FolderTree size={18} /></span>
        <div>
          <strong>当前根目录：{root.name}</strong>
          <span title={root.fullPath}>{root.fullPath} · 已加载到 L{loadedDepth}</span>
        </div>
        <Badge tone={model.busy === 'scan' ? 'warning' : 'accent'}>
          {model.busy === 'scan' ? '正在逐层加载' : `${folderCount} 目录 · ${fileCount} 文件`}
        </Badge>
      </div>
      <div className="form-grid form-grid--three">
        <Field label="根目录递归深度" hint="选择深度后会自动按层读取；L0 只处理当前根目录。">
          <select
            className="select"
            value={model.scope.maxDepth ?? 'all'}
            onChange={(event) => void model.setCloudMaxDepth(event.target.value === 'all' ? null : Number(event.target.value))}
            disabled={disabled}
          >
            {depthOptions.map((depth) => (
              <option key={depth} value={depth}>
                {depth === 0 ? '仅根目录（L0）' : `根目录及向下 ${depth} 层（L${depth}）`}
              </option>
            ))}
            <option value="all">加载并包含全部后代</option>
          </select>
        </Field>
        <Checkbox
          checked={model.scope.includeRoot}
          onChange={(checked) => model.setScope((current) => ({ ...current, includeRoot: checked }))}
          label="分享根目录本身"
          description="选中根目录后默认开启"
          disabled={disabled}
        />
        <div className="scope-types">
          <Checkbox checked={model.scope.includeFiles} onChange={(checked) => model.setScope((current) => ({ ...current, includeFiles: checked }))} label="文件" disabled={disabled} />
          <Checkbox
            checked={model.scope.includeFolders}
            onChange={(checked) => model.setScope((current) => ({ ...current, includeFolders: checked }))}
            label="文件夹"
            disabled={disabled}
          />
        </div>
      </div>
      <div className="depth-legend">
        <GitBranch size={17} />
        <span><b>L0</b> 选中的根目录</span>
        <span><b>L1</b> 直接子项</span>
        <span><b>L2+</b> 更深层文件/目录</span>
      </div>
    </>
  )
}
