import { useMemo, type CSSProperties } from 'react'
import { FileCheck2, Files, FolderTree, GitBranch, Link2 } from 'lucide-react'
import { Badge, Checkbox, Field } from '../../../shared/ui/Primitives'
import { buildLocalFolderRuleMetrics, localPathKey, type LocalFolderRuleMetric } from '../../../shared/lib/localFolderRules'
import { useI18n } from '../../../shared/i18n/I18nProvider'
import type { LocalEntry, LocalFolderRule } from '../../../shared/types/desktop'
import type { WorkspaceModel } from '../model/useWorkspaceModel'
import { StepCard } from './StepCard'

export function ScopeSection({ model }: { model: WorkspaceModel }): React.JSX.Element {
  const isLocal = model.sourceMode === 'local'
  const { t } = useI18n()
  return (
    <StepCard
      step={2}
      title={isLocal ? t('scope.localTitle') : t('scope.cloudTitle')}
      description={
        isLocal
          ? t('scope.localDescription')
          : t('scope.cloudDescription')
      }
      aside={<Badge tone="accent"><Files size={13} /> {t('scope.recordCount', { count: model.selectedCount })}</Badge>}
    >
      {isLocal ? <LocalFolderScopeEditor model={model} /> : <CloudScopeEditor model={model} />}
    </StepCard>
  )
}

function LocalFolderScopeEditor({ model }: { model: WorkspaceModel }): React.JSX.Element {
  const { t } = useI18n()
  const folders = model.localSelection.entries.filter((entry) => entry.kind === 'folder')
  const directFiles = model.localShareEntries.filter((entry) => entry.kind === 'file')
  const ruleByPath = new Map(model.localFolderRules.map((rule) => [localPathKey(rule.path), rule]))
  const metricsByPath = useMemo(
    () => buildLocalFolderRuleMetrics(model.localSelection.entries),
    [model.localSelection.entries]
  )

  if (folders.length === 0) {
    return (
      <div className="local-scope-empty">
        <FileCheck2 size={20} />
        <div>
          <strong>{directFiles.length > 0 ? t('scope.explicitFiles', { count: directFiles.length }) : t('scope.noFolders')}</strong>
          <span>{t('scope.emptyHint')}</span>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="folder-rule-callout">
        <span className="folder-rule-callout__icon"><Link2 size={18} /></span>
        <div>
          <strong>{t('scope.folderObjectTitle')}</strong>
          <span>{t('scope.folderObjectDescription')}</span>
        </div>
        {directFiles.length > 0 && <Badge tone="neutral">{t('scope.extraFiles', { count: directFiles.length })}</Badge>}
      </div>

      <div className="folder-rule-table">
        <div className="folder-rule-table__head">
          <span>{t('scope.columnFolder')}</span>
          <span>{t('scope.columnRule')}</span>
          <span>{t('scope.columnImpact')}</span>
        </div>
        <div className="folder-rule-table__body">
          {folders.map((folder) => (
            <FolderRuleRow
              key={localPathKey(folder.path)}
              folder={folder}
              metric={metricsByPath.get(localPathKey(folder.path))}
              rule={ruleByPath.get(localPathKey(folder.path))}
              disabled={model.running}
              onChange={(value) => model.setLocalFolderRule(folder.path, value)}
            />
          ))}
        </div>
        <div className="folder-rule-table__footer">
          <FolderTree size={15} />
          <span>{t('scope.localFooter')}</span>
        </div>
      </div>
    </>
  )
}

function FolderRuleRow({
  folder,
  metric,
  rule,
  disabled,
  onChange
}: {
  folder: LocalEntry
  metric?: LocalFolderRuleMetric
  rule?: LocalFolderRule
  disabled: boolean
  onChange: (value: number | null | 'off') => void
}): React.JSX.Element {
  const { t } = useI18n()
  const availableDepth = metric?.maxDepth ?? 0
  const value = rule ? rule.maxDepth ?? 'all' : 'off'
  const impact = rule
    ? metric?.cumulativeCounts[rule.maxDepth === null ? availableDepth : Math.min(rule.maxDepth, availableDepth)] ?? 0
    : 0
  const depthOptions = Array.from({ length: Math.min(availableDepth, 20) }, (_, index) => index + 1)
  const style = { '--folder-depth': Math.min(folder.depth, 8) } as CSSProperties

  return (
    <div className={`folder-rule-row ${rule ? 'is-active' : ''}`} style={style}>
      <div className="folder-rule-row__identity">
        <span className="folder-rule-row__branch"><GitBranch size={14} /></span>
        <span className="folder-rule-row__folder"><FolderTree size={16} /></span>
        <div>
          <strong>{folder.name}</strong>
          <span title={folder.path}>{folder.relativePath}</span>
        </div>
      </div>
      <select
        className="select folder-rule-row__select"
        value={value}
        onChange={(event) => {
          if (event.target.value === 'off') return onChange('off')
          if (event.target.value === 'all') return onChange(null)
          onChange(Number(event.target.value))
        }}
        disabled={disabled}
        aria-label={t('scope.ruleAria', { name: folder.name })}
      >
        <option value="off">{t('scope.ruleOff')}</option>
        <option value="0">{t('scope.ruleRoot')}</option>
        {depthOptions.map((depth) => (
          <option key={depth} value={depth}>{t('scope.ruleDepth', { depth })}</option>
        ))}
        {availableDepth > 0 && <option value="all">{t('scope.ruleAll')}</option>}
      </select>
      <Badge tone={rule ? 'accent' : 'neutral'}>{rule ? t('scope.impact', { count: impact }) : t('scope.closed')}</Badge>
    </div>
  )
}

function CloudScopeEditor({ model }: { model: WorkspaceModel }): React.JSX.Element {
  const { t } = useI18n()
  const root = model.selectedCloudRoot
  if (!root) {
    return (
      <div className="local-scope-empty">
        <FolderTree size={20} />
        <div>
          <strong>{t('scope.chooseRootTitle')}</strong>
          <span>{t('scope.chooseRootDescription')}</span>
        </div>
      </div>
    )
  }

  const loadedDepth = model.effectiveCloudItems.reduce((maximum, item) => Math.max(maximum, item.depth), 0)
  const folderCount = model.effectiveCloudItems.filter((item) => item.kind === 'folder').length
  const fileCount = model.effectiveCloudItems.length - folderCount
  const selectedDepth = model.scope.maxDepth ?? 0
  const depthCeiling = Math.min(50, Math.max(10, loadedDepth, selectedDepth))
  const depthOptions = Array.from({ length: depthCeiling + 1 }, (_, depth) => depth)
  const disabled = model.running || model.busy === 'scan'

  return (
    <>
      <div className="folder-rule-callout">
        <span className="folder-rule-callout__icon"><FolderTree size={18} /></span>
        <div>
          <strong>{t('scope.currentRoot', { name: root.name })}</strong>
          <span title={root.fullPath}>{t('scope.loadedDepth', { path: root.fullPath, depth: loadedDepth })}</span>
        </div>
        <Badge tone={model.busy === 'scan' ? 'warning' : 'accent'}>
          {model.busy === 'scan' ? t('scope.loading') : t('scope.loadedCounts', { folders: folderCount, files: fileCount })}
        </Badge>
      </div>
      <div className="form-grid form-grid--three">
        <Field label={t('scope.depthLabel')} hint={t('scope.depthHint')}>
          <select
            className="select"
            value={model.scope.maxDepth ?? 'all'}
            onChange={(event) => void model.setCloudMaxDepth(event.target.value === 'all' ? null : Number(event.target.value))}
            disabled={disabled}
          >
            {depthOptions.map((depth) => (
              <option key={depth} value={depth}>
                {depth === 0 ? t('scope.rootOnly') : t('scope.rootDepth', { depth })}
              </option>
            ))}
            <option value="all">{t('scope.loadAll')}</option>
          </select>
        </Field>
        <Checkbox
          checked={model.scope.includeRoot}
          onChange={(checked) => model.setScope((current) => ({ ...current, includeRoot: checked }))}
          label={t('scope.includeRoot')}
          description={t('scope.includeRootDescription')}
          disabled={disabled}
        />
        <div className="scope-types">
          <Checkbox checked={model.scope.includeFiles} onChange={(checked) => model.setScope((current) => ({ ...current, includeFiles: checked }))} label={t('scope.files')} disabled={disabled} />
          <Checkbox
            checked={model.scope.includeFolders}
            onChange={(checked) => model.setScope((current) => ({ ...current, includeFolders: checked }))}
            label={t('scope.folders')}
            disabled={disabled}
          />
        </div>
      </div>
      <div className="depth-legend">
        <GitBranch size={17} />
        <span><b>L0</b> {t('scope.legendRoot')}</span>
        <span><b>L1</b> {t('scope.legendChildren')}</span>
        <span><b>L2+</b> {t('scope.legendDeeper')}</span>
      </div>
    </>
  )
}
