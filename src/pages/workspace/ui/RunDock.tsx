import { LoaderCircle, Play, Square, WandSparkles } from 'lucide-react'
import { useI18n } from '../../../shared/i18n/I18nProvider'
import { Button } from '../../../shared/ui/Primitives'
import type { WorkspaceModel } from '../model/useWorkspaceModel'

export function RunDock({ model }: { model: WorkspaceModel }): React.JSX.Element {
  const { t } = useI18n()

  return (
    <div className="run-dock">
      <div className="run-dock__summary">
        <span className="run-dock__icon"><WandSparkles size={20} /></span>
        <div>
          <strong>{model.sourceMode === 'local' ? t('run.localFlow') : t('run.cloudFlow')}</strong>
          <small>{t('run.summary', { count: model.selectedCount, format: model.exportSettings.format === 'both' ? 'CSV + Excel' : model.exportSettings.format.toUpperCase() })}</small>
        </div>
      </div>
      {model.running ? (
        <Button variant="danger" onClick={() => void model.cancel()}><Square size={15} />{t('run.stop')}</Button>
      ) : (
        <Button className="button--run" onClick={() => void model.start()} disabled={Boolean(model.busy)}>
          {model.busy ? <LoaderCircle size={17} className="spin" /> : <Play size={17} fill="currentColor" />}
          {t('run.start')}
        </Button>
      )}
    </div>
  )
}
