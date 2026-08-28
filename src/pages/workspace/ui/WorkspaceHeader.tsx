import { useState } from 'react'
import { Cloud, KeyRound, Languages, LoaderCircle, RefreshCw, ShieldCheck, UserRound } from 'lucide-react'
import { Badge, Button, Input } from '../../../shared/ui/Primitives'
import { formatBytes } from '../../../shared/lib/format'
import { useI18n } from '../../../shared/i18n/I18nProvider'
import { translateExternalMessage } from '../../../shared/i18n/messages'
import type { WorkspaceModel } from '../model/useWorkspaceModel'

export function WorkspaceHeader({ model }: { model: WorkspaceModel }): React.JSX.Element {
  const [token, setToken] = useState('')
  const { runtime, account, busy, manualCodeNeeded } = model
  const { locale, setLocale, t } = useI18n()

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand__mark"><Cloud size={22} /></span>
        <div>
          <strong>QuarkLink</strong>
          <small>{t('brand.tagline')}</small>
        </div>
      </div>

      <div className="topbar__status">
        <div className="status-cluster">
          <Badge tone={runtime.verified ? 'success' : 'danger'}>
            <ShieldCheck size={13} />
            {runtime.verified ? `Skill ${runtime.skillVersion}` : t('header.runtimeError')}
          </Badge>
          <span className="status-cluster__copy">{translateExternalMessage(locale, runtime.message)}</span>
        </div>

        <div className="language-switch" role="group" aria-label={t('language.label')}>
          <Languages size={14} aria-hidden="true" />
          <button
            type="button"
            className={locale === 'zh-CN' ? 'is-active' : ''}
            onClick={() => setLocale('zh-CN')}
            aria-pressed={locale === 'zh-CN'}
            title={t('language.chinese')}
          >
            中
          </button>
          <button
            type="button"
            className={locale === 'en' ? 'is-active' : ''}
            onClick={() => setLocale('en')}
            aria-pressed={locale === 'en'}
            title={t('language.english')}
          >
            EN
          </button>
        </div>

        <div className="account-box">
          <span className={`account-box__avatar ${account.authenticated ? 'is-online' : ''}`}>
            <UserRound size={17} />
          </span>
          <div>
            <strong>{account.authenticated ? account.nickname : t('header.unauthorized')}</strong>
            <small>
              {account.authenticated
                ? `${translateExternalMessage(locale, account.membership ?? t('header.accountConnected'))}${account.totalBytes ? ` · ${formatBytes(account.usedBytes)} / ${formatBytes(account.totalBytes)}` : ''}`
                : translateExternalMessage(locale, account.message)}
            </small>
          </div>
          {account.authenticated ? (
            <Button variant="ghost" className="button--icon" onClick={() => void model.refreshAccount()} title={t('header.refreshAccount')}>
              <RefreshCw size={16} className={busy === 'account' ? 'spin' : ''} />
            </Button>
          ) : (
            <Button onClick={() => void model.login()} disabled={busy === 'account'}>
              {busy === 'account' ? <LoaderCircle size={16} className="spin" /> : <KeyRound size={16} />}
              {t('header.browserAuthorize')}
            </Button>
          )}
        </div>
      </div>

      {manualCodeNeeded && !account.authenticated && (
        <div className="manual-auth">
          <div>
            <strong>{t('header.manualAuthTitle')}</strong>
            <span>{t('header.manualAuthHelp')}</span>
          </div>
          <Input value={token} onChange={(event) => setToken(event.target.value)} placeholder={t('header.authCodePlaceholder')} />
          <Button onClick={() => void model.login(token)} disabled={!token.trim() || busy === 'account'}>
            {t('header.submitAuthCode')}
          </Button>
        </div>
      )}
    </header>
  )
}
