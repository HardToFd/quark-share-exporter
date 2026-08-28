import { FileSpreadsheet, FolderOutput } from 'lucide-react'
import { useI18n } from '../../../shared/i18n/I18nProvider'
import { Button, Field, Input, Segmented } from '../../../shared/ui/Primitives'
import type { WorkspaceModel } from '../model/useWorkspaceModel'
import { StepCard } from './StepCard'

export function ExportSection({ model }: { model: WorkspaceModel }): React.JSX.Element {
  const { t } = useI18n()

  return (
    <StepCard
      step={4}
      title={t('export.title')}
      description={t('export.description')}
    >
      <div className="export-grid">
        <Field label={t('export.format')}>
          <Segmented
            value={model.exportSettings.format}
            onChange={(format) => model.setExportSettings((current) => ({ ...current, format }))}
            disabled={model.running}
            options={[
              { value: 'csv', label: 'CSV' },
              { value: 'xlsx', label: 'Excel' },
              { value: 'both', label: t('export.both') }
            ]}
          />
        </Field>
        <Field label={t('export.fileName')} hint={t('export.fileNameHint')}>
          <Input value={model.exportSettings.fileName} onChange={(event) => model.setExportSettings((current) => ({ ...current, fileName: event.target.value }))} disabled={model.running} />
        </Field>
      </div>
      <Field label={t('export.directory')}>
        <div className="input-action">
          <Input value={model.exportSettings.outputDirectory} readOnly placeholder={t('export.directoryPlaceholder')} />
          <Button variant="secondary" onClick={() => void model.chooseOutputDirectory()} disabled={model.running}>
            <FolderOutput size={16} /> {t('export.chooseDirectory')}
          </Button>
        </div>
      </Field>
      <div className="template-fields">
        <FileSpreadsheet size={18} />
        <span>{t('export.templateFields')}</span>
        <code>{t('export.relativePath')}</code><code>FID</code><code>{t('export.shareLink')}</code><code>{t('export.passcode')}</code><code>{t('export.expiry')}</code><code>{t('export.statusError')}</code>
      </div>
    </StepCard>
  )
}
