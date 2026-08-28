import { CheckCircle2, CircleEllipsis, FileCheck2, FolderOpen, ListRestart, XCircle } from 'lucide-react'
import { Badge, Button } from '../../../shared/ui/Primitives'
import { formatDateTime } from '../../../shared/lib/format'
import { useI18n } from '../../../shared/i18n/I18nProvider'
import { translateExternalMessage, type TranslationKey, type Translator } from '../../../shared/i18n/messages'
import type { WorkspaceModel } from '../model/useWorkspaceModel'

export function ActivityRail({ model }: { model: WorkspaceModel }): React.JSX.Element {
  const { locale, t } = useI18n()
  return (
    <aside className="activity-rail">
      <div className="activity-rail__head">
        <div>
          <span className="eyebrow">{t('activity.eyebrow')}</span>
          <h2>{t('activity.title')}</h2>
        </div>
        <Badge tone={model.workflowStatus === 'running' ? 'accent' : model.workflowStatus === 'completed' ? 'success' : model.workflowStatus === 'cancelled' ? 'warning' : model.workflowStatus === 'failed' ? 'danger' : 'neutral'}>
          {model.workflowStatus === 'running'
            ? <><CircleEllipsis size={13} />{t('activity.running')}</>
            : model.workflowStatus === 'completed'
              ? <><CheckCircle2 size={13} />{t('activity.completed')}</>
              : model.workflowStatus === 'cancelled'
                ? <><XCircle size={13} />{t('activity.cancelled')}</>
                : model.workflowStatus === 'failed'
                  ? <><XCircle size={13} />{t('activity.failed')}</>
                  : t('activity.idle')}
        </Badge>
      </div>

      <div className="progress-panel">
        <div className="progress-panel__meta">
          <span>{stageLabel(model.progress.stage, t)}</span>
          <strong>{model.progress.percent}%</strong>
        </div>
        <div className="progress-track"><span style={{ width: `${Math.max(0, Math.min(100, model.progress.percent))}%` }} /></div>
        <p>{translateExternalMessage(locale, model.progress.message)}</p>
      </div>

      {model.result && (
        <div className="result-card">
          <div className="result-card__summary">
            <FileCheck2 size={22} />
            <div><strong>{t('activity.result', { success: model.result.successCount })}</strong><small>{t('activity.resultDetails', { failed: model.result.failedCount, rows: model.result.rowCount })}</small></div>
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
          <div className="activity-empty"><ListRestart size={22} /><span>{t('activity.empty')}</span></div>
        ) : (
          [...model.activities].reverse().map((item) => (
            <div className={`activity-item activity-item--${item.level}`} key={item.id}>
              <span className="activity-item__dot">{item.level === 'error' ? <XCircle size={13} /> : item.level === 'success' ? <CheckCircle2 size={13} /> : null}</span>
              <div><p>{translateExternalMessage(locale, item.message)}</p><time>{formatDateTime(item.timestamp, locale)}</time></div>
            </div>
          ))
        )}
      </div>
    </aside>
  )
}

function stageLabel(stage: string, t: Translator): string {
  const keys: Record<string, TranslationKey> = {
    preflight: 'stage.preflight',
    upload: 'stage.upload',
    select: 'stage.select',
    share: 'stage.share',
    export: 'stage.export',
    complete: 'stage.complete',
    cancelled: 'stage.cancelled',
    failed: 'stage.failed'
  }
  return keys[stage] ? t(keys[stage]) : stage
}
