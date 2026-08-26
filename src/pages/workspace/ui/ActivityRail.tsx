import { CheckCircle2, CircleEllipsis, FileCheck2, FolderOpen, ListRestart, XCircle } from 'lucide-react'
import { Badge, Button } from '../../../shared/ui/Primitives'
import { formatDateTime } from '../../../shared/lib/format'
import type { WorkspaceModel } from '../model/useWorkspaceModel'

export function ActivityRail({ model }: { model: WorkspaceModel }): React.JSX.Element {
  return (
    <aside className="activity-rail">
      <div className="activity-rail__head">
        <div>
          <span className="eyebrow">LIVE ACTIVITY</span>
          <h2>任务动态</h2>
        </div>
        <Badge tone={model.running ? 'accent' : model.result ? 'success' : 'neutral'}>
          {model.running ? <><CircleEllipsis size={13} />运行中</> : model.result ? <><CheckCircle2 size={13} />已完成</> : '待命'}
        </Badge>
      </div>

      <div className="progress-panel">
        <div className="progress-panel__meta">
          <span>{stageLabel(model.progress.stage)}</span>
          <strong>{model.progress.percent}%</strong>
        </div>
        <div className="progress-track"><span style={{ width: `${Math.max(0, Math.min(100, model.progress.percent))}%` }} /></div>
        <p>{model.progress.message}</p>
      </div>

      {model.result && (
        <div className="result-card">
          <div className="result-card__summary">
            <FileCheck2 size={22} />
            <div><strong>{model.result.successCount} 成功</strong><small>{model.result.failedCount} 失败 · {model.result.rowCount} 条记录</small></div>
          </div>
          <div className="result-files">
            {model.result.files.map((file) => (
              <button type="button" key={file} onClick={() => void model.revealFile(file)} title={file}>
                <FolderOpen size={15} /><span>{file.split(/[\\/]/).pop()}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="activity-list">
        {model.activities.length === 0 ? (
          <div className="activity-empty"><ListRestart size={22} /><span>任务开始后，这里会显示上传、分享和导出进度。</span></div>
        ) : (
          [...model.activities].reverse().map((item) => (
            <div className={`activity-item activity-item--${item.level}`} key={item.id}>
              <span className="activity-item__dot">{item.level === 'error' ? <XCircle size={13} /> : item.level === 'success' ? <CheckCircle2 size={13} /> : null}</span>
              <div><p>{item.message}</p><time>{formatDateTime(item.timestamp)}</time></div>
            </div>
          ))
        )}
      </div>
    </aside>
  )
}

function stageLabel(stage: string): string {
  return ({ preflight: '任务预检', upload: '批量上传', select: '范围筛选', share: '创建分享链', export: '导出文件', complete: '任务完成', cancelled: '已取消' } as Record<string, string>)[stage] ?? stage
}
