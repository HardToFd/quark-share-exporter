import { Files, GitBranch } from 'lucide-react'
import { Badge, Checkbox, Field } from '../../../shared/ui/Primitives'
import type { WorkspaceModel } from '../model/useWorkspaceModel'
import { StepCard } from './StepCard'

export function ScopeSection({ model }: { model: WorkspaceModel }): React.JSX.Element {
  return (
    <StepCard
      step={2}
      title="定义递归范围"
      description="默认分享目录内文件，不分享整个根目录；深度 L1 表示直接子项。"
      aside={<Badge tone="accent"><Files size={13} /> 将处理 {model.selectedCount} 项</Badge>}
    >
      <div className="form-grid form-grid--three">
        <Field label="最大递归深度" hint="不限会包含根目录下所有已检索到的后代。">
          <select
            className="select"
            value={model.scope.maxDepth ?? 'all'}
            onChange={(event) => model.setScope((current) => ({ ...current, maxDepth: event.target.value === 'all' ? null : Number(event.target.value) }))}
            disabled={model.running}
          >
            <option value="all">不限深度</option>
            <option value="0">仅根目录 L0</option>
            <option value="1">直接子项 L1</option>
            <option value="2">递归到 L2</option>
            <option value="3">递归到 L3</option>
            <option value="5">递归到 L5</option>
            <option value="10">递归到 L10</option>
          </select>
        </Field>
        <Checkbox
          checked={model.scope.includeRoot}
          onChange={(checked) => model.setScope((current) => ({ ...current, includeRoot: checked }))}
          label="分享根目录本身"
          description="关闭时只分享目录内项目"
          disabled={model.running}
        />
        <div className="scope-types">
          <Checkbox checked={model.scope.includeFiles} onChange={(checked) => model.setScope((current) => ({ ...current, includeFiles: checked }))} label="文件" disabled={model.running} />
          <Checkbox
            checked={model.scope.includeFolders && model.sourceMode === 'cloud'}
            onChange={(checked) => model.setScope((current) => ({ ...current, includeFolders: checked }))}
            label="文件夹"
            description={model.sourceMode === 'local' ? '上传结果不返回新建目录 FID' : undefined}
            disabled={model.running || model.sourceMode === 'local'}
          />
        </div>
      </div>
      <div className="depth-legend">
        <GitBranch size={17} />
        <span><b>L0</b> 选中的根目录</span>
        <span><b>L1</b> 直接子项</span>
        <span><b>L2+</b> 更深层文件/目录</span>
      </div>
    </StepCard>
  )
}
