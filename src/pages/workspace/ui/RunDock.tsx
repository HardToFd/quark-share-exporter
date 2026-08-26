import { LoaderCircle, Play, Square, WandSparkles } from 'lucide-react'
import { Button } from '../../../shared/ui/Primitives'
import type { WorkspaceModel } from '../model/useWorkspaceModel'

export function RunDock({ model }: { model: WorkspaceModel }): React.JSX.Element {
  return (
    <div className="run-dock">
      <div className="run-dock__summary">
        <span className="run-dock__icon"><WandSparkles size={20} /></span>
        <div>
          <strong>{model.sourceMode === 'local' ? '上传 → 分享 → 导出' : '目录筛选 → 分享 → 导出'}</strong>
          <small>{model.selectedCount} 个项目 · {model.exportSettings.format === 'both' ? 'CSV + Excel' : model.exportSettings.format.toUpperCase()}</small>
        </div>
      </div>
      {model.running ? (
        <Button variant="danger" onClick={() => void model.cancel()}><Square size={15} />停止任务</Button>
      ) : (
        <Button className="button--run" onClick={() => void model.start()}>
          {model.busy ? <LoaderCircle size={17} className="spin" /> : <Play size={17} fill="currentColor" />}
          一键开始
        </Button>
      )}
    </div>
  )
}
