import { ArrowRight, DatabaseZap, Layers3, Link2, X } from 'lucide-react'
import { Badge } from '../../shared/ui/Primitives'
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

  return (
    <div className="app-shell">
      <div className="ambient ambient--one" />
      <div className="ambient ambient--two" />
      <WorkspaceHeader model={model} />

      <main className="workspace-layout">
        <div className="workspace-main">
          <section className="hero">
            <div>
              <div className="hero__eyebrow"><Badge tone="accent">OFFICIAL SKILL RUNTIME</Badge><span>本机处理 · 不导出凭据</span></div>
              <h1>把一整个目录，变成<br /><span>可交付的分享链清单。</span></h1>
              <p>批量上传、递归筛选、公开/私密分享与 CSV/Excel 导出，在一条可追踪的桌面工作流里完成。</p>
            </div>
            <div className="hero__flow" aria-label="工作流">
              <FlowNode icon={<DatabaseZap size={19} />} label="上传/扫描" detail="Skill NDJSON" />
              <ArrowRight size={17} />
              <FlowNode icon={<Layers3 size={19} />} label="深度筛选" detail="Path + FID" />
              <ArrowRight size={17} />
              <FlowNode icon={<Link2 size={19} />} label="批量分享" detail="CSV / Excel" />
            </div>
          </section>

          {model.notice && (
            <div className="notice-bar">
              <span>{model.notice}</span>
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
