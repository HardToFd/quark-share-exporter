import { FileSpreadsheet, FolderOutput } from 'lucide-react'
import { Button, Field, Input, Segmented } from '../../../shared/ui/Primitives'
import type { WorkspaceModel } from '../model/useWorkspaceModel'
import { StepCard } from './StepCard'

export function ExportSection({ model }: { model: WorkspaceModel }): React.JSX.Element {
  return (
    <StepCard
      step={4}
      title="设置导出文件"
      description="CSV 使用 UTF-8 BOM；Excel 含“分享链接”和“任务摘要”两个工作表。"
    >
      <div className="export-grid">
        <Field label="格式">
          <Segmented
            value={model.exportSettings.format}
            onChange={(format) => model.setExportSettings((current) => ({ ...current, format }))}
            disabled={model.running}
            options={[
              { value: 'csv', label: 'CSV' },
              { value: 'xlsx', label: 'Excel' },
              { value: 'both', label: '两种都要' }
            ]}
          />
        </Field>
        <Field label="文件名" hint="如果已存在同名文件，会自动追加序号，不覆盖原文件。">
          <Input value={model.exportSettings.fileName} onChange={(event) => model.setExportSettings((current) => ({ ...current, fileName: event.target.value }))} disabled={model.running} />
        </Field>
      </div>
      <Field label="导出目录">
        <div className="input-action">
          <Input value={model.exportSettings.outputDirectory} readOnly placeholder="请选择保存 CSV/Excel 的本机目录" />
          <Button variant="secondary" onClick={() => void model.chooseOutputDirectory()} disabled={model.running}>
            <FolderOutput size={16} /> 选择目录
          </Button>
        </div>
      </Field>
      <div className="template-fields">
        <FileSpreadsheet size={18} />
        <span>模板字段：</span>
        <code>相对路径</code><code>FID</code><code>分享链接</code><code>提取码</code><code>有效期</code><code>状态/错误</code>
      </div>
    </StepCard>
  )
}
