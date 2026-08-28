import { Eye, KeyRound, Link2, LockKeyhole } from 'lucide-react'
import { useI18n } from '../../../shared/i18n/I18nProvider'
import type { Translator } from '../../../shared/i18n/messages'
import { Badge, Checkbox, Field, Input, Segmented } from '../../../shared/ui/Primitives'
import type { ExpiryType } from '../../../shared/types/desktop'
import type { WorkspaceModel } from '../model/useWorkspaceModel'
import { StepCard } from './StepCard'

export function ShareSection({ model }: { model: WorkspaceModel }): React.JSX.Element {
  const { t } = useI18n()

  return (
    <StepCard
      step={3}
      title={t('share.title')}
      description={t('share.description')}
      aside={<Badge tone={model.shareConfirmed ? 'success' : 'warning'}>{model.shareConfirmed ? t('share.confirmed') : t('share.pending')}</Badge>}
    >
      <div className="share-grid">
        <Field label={t('share.granularity')}>
          <Segmented
            value={model.share.granularity}
            onChange={(granularity) => model.updateShare({ granularity })}
            disabled={model.running}
            options={[
              { value: 'per-item', label: t('share.perItem'), description: t('share.perItemDescription') },
              { value: 'bundle', label: t('share.bundle'), description: t('share.bundleDescription') }
            ]}
          />
        </Field>
        <Field label={t('share.visibility')}>
          <Segmented
            value={model.share.visibility}
            onChange={(visibility) => model.updateShare({ visibility })}
            disabled={model.running}
            options={[
              { value: 'public', label: t('share.public'), description: t('share.publicDescription') },
              { value: 'private', label: t('share.private'), description: t('share.privateDescription') }
            ]}
          />
        </Field>
      </div>

      <div className="form-grid form-grid--three">
        <Field label={t('share.expiry')}>
          <select className="select" value={model.share.expiryType} onChange={(event) => model.updateShare({ expiryType: Number(event.target.value) as ExpiryType })} disabled={model.running}>
            <option value={1}>{t('share.expiryPermanent')}</option>
            {[1, 7, 30, 60, 100, 180].map((days, index) => (
              <option key={days} value={index + 2}>{t('share.expiryDays', { days })}</option>
            ))}
          </select>
        </Field>
        <Field label={t('share.titlePrefix')}>
          <Input value={model.share.titlePrefix} onChange={(event) => model.updateShare({ titlePrefix: event.target.value })} maxLength={60} disabled={model.running} />
        </Field>
        {model.share.granularity === 'per-item' ? (
          <Field label={t('share.concurrency')} hint={t('share.concurrencyHint')}>
            <select className="select" value={model.share.concurrency} onChange={(event) => model.updateShare({ concurrency: Number(event.target.value) })} disabled={model.running}>
              <option value={1}>{t('share.concurrencySafe')}</option>
              <option value={2}>{t('share.concurrencyRecommended')}</option>
              <option value={3}>{t('share.concurrencyFast')}</option>
            </select>
          </Field>
        ) : (
          <Field label={t('share.bundleSize')} hint={t('share.bundleSizeHint')}>
            <Input type="number" min={1} max={100} value={model.share.bundleSize} onChange={(event) => model.updateShare({ bundleSize: Number(event.target.value) })} disabled={model.running} />
          </Field>
        )}
      </div>

      <div className={`share-preview ${model.share.visibility === 'private' ? 'is-private' : ''}`}>
        <span className="share-preview__icon">{model.share.visibility === 'private' ? <LockKeyhole size={19} /> : <Eye size={19} />}</span>
        <div>
          <strong>{model.share.visibility === 'private' ? t('share.privatePreview') : t('share.publicPreview')}</strong>
          <small>{expiryText(model.share.expiryType, t)} · {model.share.granularity === 'per-item' ? t('share.perItemPreview') : t('share.bundlePreview', { count: model.share.bundleSize })}</small>
        </div>
        <Link2 size={18} />
      </div>

      <div className="confirmation-row">
        <Checkbox checked={model.share.continueOnError} onChange={(continueOnError) => model.updateShare({ continueOnError })} label={t('share.continueOnError')} description={t('share.continueOnErrorDescription')} disabled={model.running} />
        <Checkbox
          checked={model.shareConfirmed}
          onChange={model.setShareConfirmed}
          label={t('share.confirmLabel')}
          description={model.share.visibility === 'private' ? t('share.privateConfirmDescription') : t('share.publicConfirmDescription')}
          disabled={model.running}
        />
      </div>
      {model.share.visibility === 'private' && <div className="inline-alert"><KeyRound size={16} /> {t('share.passcodeAlert')}</div>}
    </StepCard>
  )
}

function expiryText(type: number, t: Translator): string {
  if (type === 1) return t('share.expiryPermanent')
  const days = ({ 2: 1, 3: 7, 4: 30, 5: 60, 6: 100, 7: 180 } as Record<number, number>)[type]
  return days ? t('share.expiryDaysLong', { days }) : t('share.expiryUnknown')
}
