import { CloudCog, File, FilePlus2, Folder, FolderOpen, FolderSearch, LoaderCircle, Search, Trash2, TriangleAlert } from 'lucide-react'
import { Badge, Button, Field, Input, Segmented } from '../../../shared/ui/Primitives'
import { formatBytes } from '../../../shared/lib/format'
import { localPathKey } from '../../../shared/lib/localFolderRules'
import { useI18n } from '../../../shared/i18n/I18nProvider'
import { translateExternalMessage } from '../../../shared/i18n/messages'
import type { LocalEntry, UploadTarget } from '../../../shared/types/desktop'
import type { WorkspaceModel } from '../model/useWorkspaceModel'
import { CloudDriveBrowser } from './CloudDriveBrowser'
import { StepCard } from './StepCard'

export function SourceSection({ model }: { model: WorkspaceModel }): React.JSX.Element {
  const { locale, t } = useI18n()
  const localFiles = model.localSelection.entries.filter((entry) => entry.kind === 'file')
  const localBytes = localFiles.reduce((sum, entry) => sum + entry.size, 0)
  const entryByPath = new Map(model.localSelection.entries.map((entry) => [localPathKey(entry.path), entry]))
  const localRoots = model.localSelection.roots.flatMap((root) => {
    const entry = entryByPath.get(localPathKey(root))
    return entry ? [entry] : []
  })

  return (
    <StepCard
      step={1}
      title={t('source.title')}
      description={t('source.description')}
      aside={<Badge tone="accent">{model.sourceMode === 'local' ? t('source.asideLocal') : t('source.asideCloud')}</Badge>}
    >
      <Segmented
        value={model.sourceMode}
        onChange={model.setSourceMode}
        disabled={model.running}
        options={[
          { value: 'local', label: t('source.localMode'), description: t('source.localModeDescription') },
          { value: 'cloud', label: t('source.cloudMode'), description: t('source.cloudModeDescription') }
        ]}
      />

      {model.sourceMode === 'local' ? (
        <div className="source-pane">
          <div className="source-actions">
            <Button variant="secondary" onClick={() => void model.addLocal('files')} disabled={model.busy === 'local' || model.running}>
              {model.busy === 'local' ? <LoaderCircle size={16} className="spin" /> : <FilePlus2 size={16} />}
              {t('source.addFiles')}
            </Button>
            <Button variant="secondary" onClick={() => void model.addLocal('folder')} disabled={model.busy === 'local' || model.running}>
              <FolderOpen size={16} /> {t('source.addFolder')}
            </Button>
            {model.localSelection.entries.length > 0 && (
              <Button variant="ghost" onClick={model.clearLocal} disabled={model.running}>
                <Trash2 size={15} /> {t('source.clear')}
              </Button>
            )}
            <div className="source-summary">
              {t('source.summary', { roots: localRoots.length, files: localFiles.length, size: formatBytes(localBytes) })}
            </div>
          </div>

          <UploadTargetEditor target={model.uploadTarget} onChange={model.setUploadTarget} disabled={model.running} />

          {model.localSelection.skippedSymlinks > 0 && (
            <div className="inline-alert inline-alert--warning">
              <TriangleAlert size={16} /> {t('source.skippedSymlinks', { count: model.localSelection.skippedSymlinks })}
            </div>
          )}
          <LocalRootList roots={localRoots} entries={model.localSelection.entries} />
        </div>
      ) : (
        <div className="source-pane">
          <div className="cloud-load-row">
            <Button onClick={() => void model.loadCloudDrive()} disabled={model.busy === 'scan' || model.running || !model.account.authenticated}>
              {model.busy === 'scan' ? <LoaderCircle size={16} className="spin" /> : <CloudCog size={16} />}
              {t('source.loadDrive')}
            </Button>
            <span>{t('source.loadDriveHint')}</span>
          </div>
          <div className="cloud-search">
            <Field label={t('source.searchLabel')} hint={t('source.searchHint')}>
              <div className="input-action">
                <Input
                  value={model.cloudQuery}
                  onChange={(event) => model.setCloudQuery(event.target.value)}
                  placeholder={t('source.searchPlaceholder')}
                  maxLength={50}
                  disabled={model.running}
                />
                <Button onClick={() => void model.scanCloud()} disabled={!model.cloudQuery.trim() || model.busy === 'scan' || model.running}>
                  {model.busy === 'scan' ? <LoaderCircle size={16} className="spin" /> : <Search size={16} />}
                  {t('source.search')}
                </Button>
              </div>
            </Field>
          </div>

          {model.cloudScan ? (
            <>
              <div className="scan-result-bar">
                <div>
                  <CloudCog size={17} />
                  <span>{translateExternalMessage(locale, model.cloudScan.message)}</span>
                </div>
                <div className="scan-result-bar__badges">
                  <Badge tone={model.cloudScan.artifactAvailable ? 'success' : 'warning'}>
                    {model.cloudScan.artifactAvailable ? t('source.scanLoaded', { count: model.cloudScan.returned }) : t('source.previewOnly')}
                  </Badge>
                  {model.cloudScan.truncated && <Badge tone="danger">{t('source.truncated', { returned: model.cloudScan.returned, total: model.cloudScan.total })}</Badge>}
                </div>
              </div>

              {model.cloudScan.checkAllLink && <div className="cloud-external-link"><Button variant="ghost" onClick={() => void model.openExternal(model.cloudScan!.checkAllLink!)}><FolderSearch size={16} /> {t('source.viewInDrive')}</Button></div>}
              {model.cloudScan.browseHint && <p className="browse-hint">{translateExternalMessage(locale, model.cloudScan.browseHint)}</p>}
            </>
          ) : model.cloudRootLoaded ? (
            <div className="scan-result-bar">
              <div><CloudCog size={17} /><span>{translateExternalMessage(locale, model.cloudBrowseMessage)}</span></div>
              <Badge tone="success">{t('source.lazyLoading')}</Badge>
            </div>
          ) : null}

          {model.cloudItems.length > 0 || model.cloudRootLoaded ? (
            <CloudDriveBrowser
              items={model.cloudItems}
              total={model.cloudScan?.total ?? model.cloudItems.length}
              truncated={model.cloudScan?.truncated ?? false}
              hierarchical={model.cloudRootLoaded || model.cloudLoadedFolderFids.size > 0}
              selectedFid={model.cloudRootFid}
              disabled={model.running || model.busy === 'scan'}
              loadedFolderFids={model.cloudLoadedFolderFids}
              loadingFolderFids={model.cloudLoadingFolderFids}
              onSelect={model.setCloudRootFid}
              onExpand={model.loadCloudFolder}
            />
          ) : null}
        </div>
      )}
    </StepCard>
  )
}

function LocalRootList({ roots, entries }: { roots: LocalEntry[]; entries: LocalEntry[] }): React.JSX.Element {
  const { t } = useI18n()
  if (roots.length === 0) {
    return <div className="empty-state"><FolderSearch size={22} /><span>{t('source.emptyLocal')}</span></div>
  }

  return (
    <div className="local-root-list">
      <div className="local-root-list__head">
        <span>{t('source.columnEntry')}</span>
        <span>{t('source.columnContents')}</span>
        <span>{t('source.columnDefaultShare')}</span>
      </div>
      {roots.map((root) => {
        const descendants = entries.filter((entry) => localPathKey(entry.rootPath) === localPathKey(root.path))
        const files = descendants.filter((entry) => entry.kind === 'file')
        const folders = descendants.filter((entry) => entry.kind === 'folder')
        const bytes = files.reduce((sum, entry) => sum + entry.size, 0)
        return (
          <div className="local-root-list__row" key={localPathKey(root.path)}>
            <span className={`local-root-list__icon is-${root.kind}`}>
              {root.kind === 'folder' ? <Folder size={17} /> : <File size={17} />}
            </span>
            <div className="local-root-list__identity">
              <strong>{root.name}</strong>
              <span title={root.path}>{root.path}</span>
            </div>
            <span className="local-root-list__contents">
              {root.kind === 'folder'
                ? t('source.folderContents', { folders: Math.max(0, folders.length - 1), files: files.length, size: formatBytes(bytes) })
                : formatBytes(root.size)}
            </span>
            <Badge tone={root.kind === 'folder' ? 'accent' : 'neutral'}>
              {root.kind === 'folder' ? t('source.rootLink') : t('source.fileLink')}
            </Badge>
          </div>
        )
      })}
      <div className="local-root-list__note">{t('source.rootNote')}</div>
    </div>
  )
}

function UploadTargetEditor({
  target,
  onChange,
  disabled
}: {
  target: UploadTarget
  onChange: (target: UploadTarget) => void
  disabled: boolean
}): React.JSX.Element {
  const { t } = useI18n()
  return (
    <div className="target-editor">
      <Field label={t('source.targetLabel')} hint={t('source.targetHint')}>
        <select
          className="select"
          value={target.mode}
          onChange={(event) => {
            const mode = event.target.value
            onChange(mode === 'fid' ? { mode: 'fid', fid: '' } : { mode } as UploadTarget)
          }}
          disabled={disabled}
        >
          <option value="default" disabled>{t('source.targetSelect')}</option>
          <option value="root">{t('source.targetRoot')}</option>
          <option value="fid">{t('source.targetFid')}</option>
        </select>
      </Field>
      {target.mode === 'fid' && (
        <Field label={t('source.targetFidLabel')}>
          <Input value={target.fid} onChange={(event) => onChange({ mode: 'fid', fid: event.target.value })} placeholder={t('source.targetFidPlaceholder')} disabled={disabled} />
        </Field>
      )}
    </div>
  )
}
