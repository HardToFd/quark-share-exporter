import { Eye, KeyRound, Link2, LockKeyhole } from 'lucide-react'
import { Badge, Checkbox, Field, Input, Segmented } from '../../../shared/ui/Primitives'
import type { ExpiryType } from '../../../shared/types/desktop'
import type { WorkspaceModel } from '../model/useWorkspaceModel'
import { StepCard } from './StepCard'

export function ShareSection({ model }: { model: WorkspaceModel }): React.JSX.Element {
  return (
    <StepCard
      step={3}
      title="选择分享方式"
      description="公开/私密、有效期与分享粒度均由你确认；私密提取码由夸克服务端生成。"
      aside={<Badge tone={model.shareConfirmed ? 'success' : 'warning'}>{model.shareConfirmed ? '已确认' : '待确认'}</Badge>}
    >
      <div className="share-grid">
        <Field label="分享粒度">
          <Segmented
            value={model.share.granularity}
            onChange={(granularity) => model.updateShare({ granularity })}
            disabled={model.running}
            options={[
              { value: 'per-item', label: '逐项生成', description: '每个文件/目录一个链接' },
              { value: 'bundle', label: '合并成组', description: '每组最多 100 项' }
            ]}
          />
        </Field>
        <Field label="链接权限">
          <Segmented
            value={model.share.visibility}
            onChange={(visibility) => model.updateShare({ visibility })}
            disabled={model.running}
            options={[
              { value: 'public', label: '公开链接', description: '无需提取码' },
              { value: 'private', label: '私密链接', description: '服务端自动生成提取码' }
            ]}
          />
        </Field>
      </div>

      <div className="form-grid form-grid--three">
        <Field label="有效期">
          <select className="select" value={model.share.expiryType} onChange={(event) => model.updateShare({ expiryType: Number(event.target.value) as ExpiryType })} disabled={model.running}>
            <option value={1}>永久有效</option>
            <option value={2}>1 天</option>
            <option value={3}>7 天</option>
            <option value={4}>30 天</option>
            <option value={5}>60 天</option>
            <option value={6}>100 天</option>
            <option value={7}>180 天</option>
          </select>
        </Field>
        <Field label="分享标题前缀">
          <Input value={model.share.titlePrefix} onChange={(event) => model.updateShare({ titlePrefix: event.target.value })} maxLength={60} disabled={model.running} />
        </Field>
        {model.share.granularity === 'per-item' ? (
          <Field label="并发数" hint="为降低风控与限流风险，最多 3。">
            <select className="select" value={model.share.concurrency} onChange={(event) => model.updateShare({ concurrency: Number(event.target.value) })} disabled={model.running}>
              <option value={1}>1（最稳妥）</option>
              <option value={2}>2（推荐）</option>
              <option value={3}>3（更快）</option>
            </select>
          </Field>
        ) : (
          <Field label="每组数量" hint="过多 FID 会增加命令长度，最大 100。">
            <Input type="number" min={1} max={100} value={model.share.bundleSize} onChange={(event) => model.updateShare({ bundleSize: Number(event.target.value) })} disabled={model.running} />
          </Field>
        )}
      </div>

      <div className={`share-preview ${model.share.visibility === 'private' ? 'is-private' : ''}`}>
        <span className="share-preview__icon">{model.share.visibility === 'private' ? <LockKeyhole size={19} /> : <Eye size={19} />}</span>
        <div>
          <strong>{model.share.visibility === 'private' ? '私密分享链 + 自动提取码' : '公开分享链'}</strong>
          <small>{expiryText(model.share.expiryType)} · {model.share.granularity === 'per-item' ? '逐项独立链接' : `每 ${model.share.bundleSize} 项一组`}</small>
        </div>
        <Link2 size={18} />
      </div>

      <div className="confirmation-row">
        <Checkbox checked={model.share.continueOnError} onChange={(continueOnError) => model.updateShare({ continueOnError })} label="失败后继续" description="失败项写入导出文件，不丢弃已成功结果" disabled={model.running} />
        <Checkbox
          checked={model.shareConfirmed}
          onChange={model.setShareConfirmed}
          label="我已确认链接权限和有效期"
          description={model.share.visibility === 'private' ? '提取码不能自定义，将由夸克生成' : '公开链接无需提取码'}
          disabled={model.running}
        />
      </div>
      {model.share.visibility === 'private' && <div className="inline-alert"><KeyRound size={16} /> 提取码会与分享链接分别写入 CSV/Excel，便于后续系统读取。</div>}
    </StepCard>
  )
}

function expiryText(type: number): string {
  return ({ 1: '永久有效', 2: '1 天有效', 3: '7 天有效', 4: '30 天有效', 5: '60 天有效', 6: '100 天有效', 7: '180 天有效' } as Record<number, string>)[type] ?? '未知有效期'
}
