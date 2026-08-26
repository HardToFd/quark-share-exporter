import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  AccountInfo,
  CloudScanResult,
  ExportResult,
  ExportSettings,
  LocalSelection,
  RuntimeStatus,
  ScopeSettings,
  ShareSettings,
  SourceMode,
  UploadTarget,
  WorkflowEvent,
  WorkflowRequest
} from '../../../shared/types/desktop'
import { countScopedItems, rebaseCloudItems } from '../lib/workspaceData'

const initialRuntime: RuntimeStatus = {
  available: false,
  verified: false,
  skillVersion: '',
  cliVersion: '',
  message: '正在检查官方运行时…'
}

const initialAccount: AccountInfo = {
  authenticated: false,
  message: '正在检查授权状态…'
}

export interface ActivityLine {
  id: string
  message: string
  level: 'info' | 'success' | 'warning' | 'error'
  timestamp: string
}

export function useWorkspaceModel() {
  const bridge = window.quarkApp
  const [runtime, setRuntime] = useState(initialRuntime)
  const [account, setAccount] = useState(initialAccount)
  const [sourceMode, setSourceMode] = useState<SourceMode>('local')
  const [localSelection, setLocalSelection] = useState<LocalSelection>({ roots: [], entries: [], skippedSymlinks: 0 })
  const [uploadTarget, setUploadTarget] = useState<UploadTarget>({ mode: 'default' })
  const [cloudQuery, setCloudQuery] = useState('')
  const [cloudRootPath, setCloudRootPath] = useState('')
  const [cloudScan, setCloudScan] = useState<CloudScanResult | null>(null)
  const [scope, setScope] = useState<ScopeSettings>({
    maxDepth: null,
    includeRoot: false,
    includeFiles: true,
    includeFolders: false
  })
  const [share, setShare] = useState<ShareSettings>({
    granularity: 'per-item',
    visibility: 'public',
    expiryType: 1,
    titlePrefix: '夸克分享',
    bundleSize: 100,
    concurrency: 2,
    continueOnError: true
  })
  const [shareConfirmed, setShareConfirmed] = useState(false)
  const [exportSettings, setExportSettings] = useState<ExportSettings>({
    format: 'both',
    outputDirectory: '',
    fileName: `夸克分享链-${new Date().toISOString().slice(0, 10)}`
  })
  const [busy, setBusy] = useState<'account' | 'local' | 'scan' | null>(null)
  const [running, setRunning] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)
  const activeJob = useRef<string | null>(null)
  const [activities, setActivities] = useState<ActivityLine[]>([])
  const [progress, setProgress] = useState({ stage: 'preflight', percent: 0, message: '等待开始' })
  const [result, setResult] = useState<ExportResult | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [manualCodeNeeded, setManualCodeNeeded] = useState(false)

  const addActivity = useCallback((message: string, level: ActivityLine['level'] = 'info') => {
    setActivities((current) => [
      ...current.slice(-199),
      { id: `${Date.now()}-${Math.random()}`, message, level, timestamp: new Date().toISOString() }
    ])
  }, [])

  const refreshAccount = useCallback(async () => {
    if (!bridge) return
    setBusy('account')
    try {
      setAccount(await bridge.getAccountInfo())
    } catch (error) {
      setAccount({ authenticated: false, message: errorMessage(error) })
    } finally {
      setBusy(null)
    }
  }, [bridge])

  useEffect(() => {
    if (!bridge) {
      setRuntime({ ...initialRuntime, message: '请在 Electron 桌面应用中打开' })
      setAccount({ authenticated: false, message: '桌面桥接未加载' })
      return
    }
    void bridge.runtimeStatus().then(setRuntime).catch((error) => setRuntime({ ...initialRuntime, message: errorMessage(error) }))
    void refreshAccount()
    const unsubscribeActivity = bridge.onActivity((message) => addActivity(message))
    const unsubscribeWorkflow = bridge.onWorkflowEvent((event: WorkflowEvent) => {
      if (activeJob.current && event.jobId !== activeJob.current) return
      addActivity(event.message, event.level ?? 'info')
      if (event.type === 'progress' || event.type === 'stage') {
        setProgress({ stage: event.stage, percent: event.percent ?? 0, message: event.message })
      }
      if (event.result) setResult(event.result)
      if (event.type === 'complete' || event.type === 'error') {
        setRunning(false)
        activeJob.current = null
      }
    })
    return () => {
      unsubscribeActivity()
      unsubscribeWorkflow()
    }
  }, [addActivity, bridge, refreshAccount])

  const effectiveCloudItems = useMemo(
    () => rebaseCloudItems(cloudScan?.items ?? [], cloudRootPath),
    [cloudRootPath, cloudScan]
  )
  const sourceItems = sourceMode === 'local' ? localSelection.entries : effectiveCloudItems
  const selectedCount = countScopedItems(sourceItems, {
    ...scope,
    includeFolders: sourceMode === 'local' ? false : scope.includeFolders
  })

  const login = useCallback(
    async (token?: string) => {
      if (!bridge) return
      setBusy('account')
      setNotice(null)
      try {
        const response = await bridge.login(token?.trim() || undefined)
        addActivity(response.message, response.success ? 'success' : 'warning')
        setManualCodeNeeded(response.needsManualCode)
        if (response.success) await refreshAccount()
        else setNotice(response.authorizationUrl ? `${response.message} 请完成授权后粘贴 code 参数。` : response.message)
      } catch (error) {
        setNotice(errorMessage(error))
      } finally {
        setBusy(null)
      }
    },
    [addActivity, bridge, refreshAccount]
  )

  const addLocal = useCallback(
    async (kind: 'files' | 'folder') => {
      if (!bridge) return
      setBusy('local')
      setNotice(null)
      try {
        const picked = await bridge.pickLocalEntries(kind)
        if (!picked) return
        setLocalSelection((current) => mergeLocalSelections(current, picked))
        setSourceMode('local')
        addActivity(`已添加 ${picked.entries.length} 个本机项目`, 'success')
      } catch (error) {
        setNotice(errorMessage(error))
      } finally {
        setBusy(null)
      }
    },
    [addActivity, bridge]
  )

  const scanCloud = useCallback(async () => {
    if (!bridge) return
    setBusy('scan')
    setNotice(null)
    try {
      const response = await bridge.scanCloud({ query: cloudQuery, pathPrefix: '' })
      setCloudScan(response)
      setSourceMode('cloud')
      addActivity(response.message, response.total === 0 ? 'warning' : 'success')
      if (response.folderCandidates.length === 1 && !cloudRootPath) {
        setCloudRootPath(response.folderCandidates[0].fullPath)
      }
    } catch (error) {
      setNotice(errorMessage(error))
    } finally {
      setBusy(null)
    }
  }, [addActivity, bridge, cloudQuery, cloudRootPath])

  const chooseOutputDirectory = useCallback(async () => {
    if (!bridge) return
    const directory = await bridge.pickOutputDirectory()
    if (directory) setExportSettings((current) => ({ ...current, outputDirectory: directory }))
  }, [bridge])

  const updateShare = useCallback((patch: Partial<ShareSettings>) => {
    setShare((current) => ({ ...current, ...patch }))
    setShareConfirmed(false)
  }, [])

  const start = useCallback(async () => {
    if (!bridge) return
    setNotice(null)
    if (!runtime.verified) return setNotice('官方 CLI 运行时尚未通过校验')
    if (!account.authenticated) return setNotice('请先完成夸克网盘授权')
    if (!shareConfirmed) return setNotice('请确认公开/私密和有效期设置')
    if (!exportSettings.outputDirectory) return setNotice('请选择 CSV/Excel 导出目录')
    if (selectedCount === 0) return setNotice('当前筛选条件下没有可分享项目')

    const request: WorkflowRequest = {
      source:
        sourceMode === 'local'
          ? {
              mode: 'local',
              roots: localSelection.roots,
              localEntries: localSelection.entries,
              uploadTarget
            }
          : {
              mode: 'cloud',
              query: cloudQuery,
              pathPrefix: cloudRootPath,
              cloudItems: effectiveCloudItems,
              searchTotal: cloudScan?.total ?? 0,
              searchTruncated: cloudScan?.truncated ?? false
            },
      scope: { ...scope, includeFolders: sourceMode === 'local' ? false : scope.includeFolders },
      share,
      export: exportSettings
    }

    try {
      setActivities([])
      setResult(null)
      setRunning(true)
      setProgress({ stage: 'preflight', percent: 0, message: '正在创建任务…' })
      const response = await bridge.startWorkflow(request)
      activeJob.current = response.jobId
      setJobId(response.jobId)
    } catch (error) {
      setRunning(false)
      setNotice(errorMessage(error))
    }
  }, [account.authenticated, bridge, cloudQuery, cloudRootPath, cloudScan, effectiveCloudItems, exportSettings, localSelection, runtime.verified, scope, selectedCount, share, shareConfirmed, sourceMode, uploadTarget])

  const cancel = useCallback(async () => {
    if (bridge && jobId) await bridge.cancelWorkflow(jobId)
  }, [bridge, jobId])

  return {
    runtime,
    account,
    sourceMode,
    setSourceMode,
    localSelection,
    clearLocal: () => setLocalSelection({ roots: [], entries: [], skippedSymlinks: 0 }),
    uploadTarget,
    setUploadTarget,
    cloudQuery,
    setCloudQuery,
    cloudRootPath,
    setCloudRootPath,
    cloudScan,
    effectiveCloudItems,
    scope,
    setScope,
    share,
    updateShare,
    shareConfirmed,
    setShareConfirmed,
    exportSettings,
    setExportSettings,
    busy,
    running,
    activities,
    progress,
    result,
    notice,
    setNotice,
    manualCodeNeeded,
    selectedCount,
    login,
    refreshAccount,
    addLocal,
    scanCloud,
    chooseOutputDirectory,
    start,
    cancel,
    revealFile: (path: string) => bridge?.showItemInFolder(path),
    openExternal: (url: string) => bridge?.openExternal(url)
  }
}

export type WorkspaceModel = ReturnType<typeof useWorkspaceModel>

function mergeLocalSelections(current: LocalSelection, next: LocalSelection): LocalSelection {
  const roots = [...new Set([...current.roots, ...next.roots])]
  const entries = new Map(current.entries.map((entry) => [entry.path, entry]))
  for (const entry of next.entries) entries.set(entry.path, entry)
  return {
    roots,
    entries: [...entries.values()],
    skippedSymlinks: current.skippedSymlinks + next.skippedSymlinks
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
