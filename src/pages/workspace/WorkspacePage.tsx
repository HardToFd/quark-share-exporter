import { ArrowRight, DatabaseZap, Layers3, Link2, X } from 'lucide-react'
import { Badge } from '../../shared/ui/Primitives'
import { useI18n } from '../../shared/i18n/I18nProvider'
import { translateExternalMessage } from '../../shared/i18n/messages'
import { useWorkspaceModel } from './model/useWorkspaceModel'
import { ActivityRail } from './ui/ActivityRail'
import { ExportSection } from './ui/ExportSection'
import { RunDock } from './ui/RunDock'
import { ScopeSection } from './ui/ScopeSection'
import { ShareSection } from './ui/ShareSection'
import { SourceSection } from './ui/SourceSection'
import { WorkspaceHeader } from './ui/WorkspaceHeader'
import './styles/workspace.css'

export function WorkspacePage(): React.JSX.Element {
  const model = useWorkspaceModel()
  const { locale, t } = useI18n()

  return (
    <div className="app-shell">
      <div className="ambient ambient--one" />
      <div className="ambient ambient--two" />
      <WorkspaceHeader model={model} />

      <main className="workspace-layout">
        <div className="workspace-main">
          <section className="hero">
            <div>
              <div className="hero__eyebrow"><Badge tone="accent">{t('hero.runtime')}</Badge><span>{t('hero.privacy')}</span></div>
              <h1>{t('hero.titleOne')}<br /><span>{t('hero.titleTwo')}</span></h1>
              <p>{t('hero.description')}</p>
            </div>
            <div className="hero__flow" aria-label={t('hero.workflow')}>
              <FlowNode icon={<DatabaseZap size={19} />} label={t('hero.upload')} detail="Skill NDJSON" />
              <ArrowRight size={17} />
              <FlowNode icon={<Layers3 size={19} />} label={t('hero.depth')} detail="Path + FID" />
              <ArrowRight size={17} />
              <FlowNode icon={<Link2 size={19} />} label={t('hero.share')} detail="CSV / Excel" />
            </div>
          </section>

          {model.notice && (
            <div className="notice-bar">
              <span>{translateExternalMessage(locale, model.notice)}</span>
              <button type="button" onClick={() => model.setNotice(null)}><X size={16} /></button>
            </div>
          )}

          <SourceSection model={model} />
          <ScopeSection model={model} />
          <ShareSection model={model} />
          <ExportSection model={model} />
          <RunDock model={model} />
        </div>
        <ActivityRail model={model} />
      </main>
    </div>
  )
}

function FlowNode({ icon, label, detail }: { icon: React.ReactNode; label: string; detail: string }): React.JSX.Element {
  return <div className="flow-node"><span>{icon}</span><div><strong>{label}</strong><small>{detail}</small></div></div>
}
