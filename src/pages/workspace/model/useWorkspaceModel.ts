import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  AccountInfo,
  CloudEntry,
  CloudScanResult,
  ExportResult,
  ExportSettings,
  LocalFolderRule,
  LocalSelection,
  RuntimeStatus,
  ScopeSettings,
  ShareSettings,
  SourceMode,
  UploadTarget,
  WorkflowEvent,
  WorkflowRequest
} from '../../../shared/types/desktop'
import { localPathKey, selectLocalShareEntries } from '../../../shared/lib/localFolderRules'
import { countScopedItems, mergeCloudEntries, rebaseCloudItems } from '../lib/workspaceData'

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
  const [localFolderRules, setLocalFolderRules] = useState<LocalFolderRule[]>([])
  const [uploadTarget, setUploadTarget] = useState<UploadTarget>({ mode: 'default' })
  const [cloudQuery, setCloudQuery] = useState('')
  const [cloudRootFid, setCloudRootFid] = useState('')
  const [cloudScan, setCloudScan] = useState<CloudScanResult | null>(null)
  const [cloudItems, setCloudItems] = useState<CloudEntry[]>([])
  const cloudItemsRef = useRef<CloudEntry[]>([])
  const [cloudRootLoaded, setCloudRootLoaded] = useState(false)
  const [cloudLoadedFolderFids, setCloudLoadedFolderFids] = useState<Set<string>>(() => new Set())
  const cloudLoadedFolderFidsRef = useRef<Set<string>>(new Set())
  const [cloudLoadingFolderFids, setCloudLoadingFolderFids] = useState<Set<string>>(() => new Set())
  const cloudFolderLoads = useRef<Map<string, Promise<CloudEntry[]>>>(new Map())
  const [cloudBrowseMessage, setCloudBrowseMessage] = useState('')
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

  const replaceCloudItems = useCallback((items: CloudEntry[]) => {
    cloudItemsRef.current = items
    setCloudItems(items)
  }, [])

  const appendCloudItems = useCallback((items: CloudEntry[]) => {
    const merged = mergeCloudEntries(cloudItemsRef.current, items)
    cloudItemsRef.current = merged
    setCloudItems(merged)
  }, [])

  const resetCloudTree = useCallback(() => {
    cloudFolderLoads.current.clear()
    cloudLoadedFolderFidsRef.current = new Set()
    setCloudLoadedFolderFids(new Set())
    setCloudLoadingFolderFids(new Set())
    setCloudRootLoaded(false)
    replaceCloudItems([])
  }, [replaceCloudItems])

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
    () => rebaseCloudItems(cloudItems, cloudRootFid),
    [cloudItems, cloudRootFid]
  )
  const selectedCloudRoot = useMemo(
    () => cloudItems.find((folder) => folder.fid === cloudRootFid),
    [cloudItems, cloudRootFid]
  )
  const localShareEntries = useMemo(
    () => selectLocalShareEntries(localSelection.roots, localSelection.entries, localFolderRules),
    [localFolderRules, localSelection]
  )
  const selectedCount = sourceMode === 'local'
    ? localShareEntries.length
    : countScopedItems(effectiveCloudItems, scope)

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
        setLocalFolderRules((current) => addDefaultFolderRules(current, picked))
        setSourceMode('local')
        const folderCount = picked.roots.filter((root) => picked.entries.some((entry) => entry.kind === 'folder' && localPathKey(entry.path) === localPathKey(root))).length
        addActivity(
          folderCount > 0
            ? `已添加 ${picked.roots.length} 个本机入口；文件夹默认只为根目录生成分享链`
            : `已添加 ${picked.roots.length} 个本机文件`,
          'success'
        )
      } catch (error) {
        setNotice(errorMessage(error))
      } finally {
        setBusy(null)
      }
    },
    [addActivity, bridge]
  )

  const loadCloudFolder = useCallback(async (parentFid: string): Promise<CloudEntry[]> => {
    if (!bridge) return []
    const key = parentFid || '0'
    if (cloudLoadedFolderFidsRef.current.has(key)) {
      return cloudItemsRef.current.filter((item) => item.parentFid === key)
    }
    const active = cloudFolderLoads.current.get(key)
    if (active) return active

    const parent = key === '0' ? undefined : cloudItemsRef.current.find((item) => item.fid === key)
    if (key !== '0' && (!parent || parent.kind !== 'folder')) throw new Error('未找到要展开的网盘文件夹')

    const request = {
      parentFid: key,
      parentPath: parent?.fullPath ?? '',
      ancestorFids: parent ? [...(parent.ancestorFids ?? []), parent.fid] : []
    }
    setCloudLoadingFolderFids((current) => new Set(current).add(key))
    const loading = bridge.listCloudFolder(request)
      .then((response) => {
        appendCloudItems(response.items)
        const loaded = new Set(cloudLoadedFolderFidsRef.current)
        loaded.add(key)
        cloudLoadedFolderFidsRef.current = loaded
        setCloudLoadedFolderFids(loaded)
        if (key === '0') setCloudRootLoaded(true)
        setCloudBrowseMessage(response.message)
        addActivity(response.message, 'success')
        return response.items
      })
      .catch((error) => {
        const message = errorMessage(error)
        setNotice(message)
        addActivity(message, 'error')
        throw error
      })
      .finally(() => {
        cloudFolderLoads.current.delete(key)
        setCloudLoadingFolderFids((current) => {
          const next = new Set(current)
          next.delete(key)
          return next
        })
      })
    cloudFolderLoads.current.set(key, loading)
    return loading
  }, [addActivity, appendCloudItems, bridge])

  const loadCloudDepth = useCallback(async (rootFid: string, maxDepth: number | null): Promise<void> => {
    if (maxDepth === 0) return
    const root = cloudItemsRef.current.find((item) => item.fid === rootFid && item.kind === 'folder')
    if (!root) throw new Error('请先选择一个网盘文件夹作为根目录')

    let level = 0
    let folders = [root]
    const visited = new Set<string>()
    while (folders.length > 0 && (maxDepth === null || level < maxDepth)) {
      const currentLevel = folders.filter((folder) => !visited.has(folder.fid))
      if (currentLevel.length === 0) break
      currentLevel.forEach((folder) => visited.add(folder.fid))
      addActivity(`正在加载 ${root.name} 的 L${level + 1} 层（${currentLevel.length} 个目录）`)

      const children: CloudEntry[] = []
      for (let index = 0; index < currentLevel.length; index += 3) {
        const batch = currentLevel.slice(index, index + 3)
        const results = await Promise.all(batch.map((folder) => loadCloudFolder(folder.fid)))
        results.forEach((items) => children.push(...items))
      }
      folders = children.filter((item) => item.kind === 'folder')
      level += 1
    }
  }, [addActivity, loadCloudFolder])

  const selectCloudRoot = useCallback((fid: string) => {
    setCloudRootFid(fid)
    if (fid) {
      setScope((current) => ({
        ...current,
        maxDepth: 0,
        includeRoot: true,
        includeFiles: false,
        includeFolders: true
      }))
    }
  }, [])

  const runCloudScan = useCallback(async (query: string) => {
    if (!bridge) return
    setBusy('scan')
    setNotice(null)
    try {
      const response = await bridge.scanCloud({ query, pathPrefix: '' })
      resetCloudTree()
      setCloudScan(response)
      replaceCloudItems(response.items)
      const onlyFolder = response.folderCandidates.length === 1 ? response.folderCandidates[0].fid : ''
      selectCloudRoot(onlyFolder)
      setCloudBrowseMessage(response.message)
      setSourceMode('cloud')
      addActivity(response.message, response.total === 0 ? 'warning' : 'success')
    } catch (error) {
      setNotice(errorMessage(error))
    } finally {
      setBusy(null)
    }
  }, [addActivity, bridge, replaceCloudItems, resetCloudTree, selectCloudRoot])

  const scanCloud = useCallback(() => runCloudScan(cloudQuery), [cloudQuery, runCloudScan])
  const loadCloudDrive = useCallback(async () => {
    if (!bridge) return
    setBusy('scan')
    setNotice(null)
    try {
      setSourceMode('cloud')
      setCloudScan(null)
      setCloudRootFid('')
      resetCloudTree()
      const items = await loadCloudFolder('0')
      setCloudBrowseMessage(`已加载网盘根目录 ${items.length} 项；展开文件夹时会继续逐层读取`)
    } catch {
      // loadCloudFolder already reports the actionable error.
    } finally {
      setBusy(null)
    }
  }, [bridge, loadCloudFolder, resetCloudTree])

  const setCloudMaxDepth = useCallback(async (maxDepth: number | null) => {
    setScope((current) => ({ ...current, maxDepth }))
    if (!cloudRootFid || maxDepth === 0) return
    setBusy('scan')
    setNotice(null)
    try {
      await loadCloudDepth(cloudRootFid, maxDepth)
      addActivity(
        maxDepth === null
          ? '所选根目录的全部后代已加载，可以按完整目录树筛选'
          : `所选根目录已加载到 L${maxDepth}`,
        'success'
      )
    } catch {
      // The folder loader already publishes the failure message.
    } finally {
      setBusy(null)
    }
  }, [addActivity, cloudRootFid, loadCloudDepth])

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
    if (busy) return setNotice('请等待当前目录读取完成')
    if (!runtime.verified) return setNotice('官方 CLI 运行时尚未通过校验')
    if (!account.authenticated) return setNotice('请先完成夸克网盘授权')
    if (sourceMode === 'cloud' && !cloudRootFid) return setNotice('请先选择一个网盘文件夹作为递归根目录')
    if (sourceMode === 'local' && uploadTarget.mode === 'default') return setNotice('请选择上传目标目录：上传到网盘根目录，或填写目标目录 FID')
    if (sourceMode === 'local' && uploadTarget.mode === 'fid' && !uploadTarget.fid.trim()) return setNotice('请输入目标网盘目录 FID')
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
              folderRules: localFolderRules,
              uploadTarget
            }
          : {
              mode: 'cloud',
              query: cloudScan?.query ?? '*',
              pathPrefix: selectedCloudRoot?.fullPath ?? '',
              cloudItems: effectiveCloudItems,
              searchTotal: cloudScan?.total ?? cloudItems.length,
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
  }, [account.authenticated, bridge, busy, cloudItems.length, cloudRootFid, cloudScan, effectiveCloudItems, exportSettings, localFolderRules, localSelection, runtime.verified, scope, selectedCloudRoot, selectedCount, share, shareConfirmed, sourceMode, uploadTarget])

  const cancel = useCallback(async () => {
    if (bridge && jobId) await bridge.cancelWorkflow(jobId)
  }, [bridge, jobId])

  return {
    runtime,
    account,
    sourceMode,
    setSourceMode,
    localSelection,
    localFolderRules,
    localShareEntries,
    setLocalFolderRule: (path: string, maxDepth: number | null | 'off') => {
      setLocalFolderRules((current) => updateLocalFolderRule(current, path, maxDepth))
    },
    clearLocal: () => {
      setLocalSelection({ roots: [], entries: [], skippedSymlinks: 0 })
      setLocalFolderRules([])
    },
    uploadTarget,
    setUploadTarget,
    cloudQuery,
    setCloudQuery,
    cloudRootFid,
    setCloudRootFid: selectCloudRoot,
    selectedCloudRoot,
    cloudScan,
    cloudItems,
    cloudRootLoaded,
    cloudLoadedFolderFids,
    cloudLoadingFolderFids,
    cloudBrowseMessage,
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
    loadCloudDrive,
    loadCloudFolder,
    setCloudMaxDepth,
    chooseOutputDirectory,
    start,
    cancel,
    revealFile: (path: string) => bridge?.showItemInFolder(path),
    openExternal: (url: string) => bridge?.openExternal(url)
  }
}

export type WorkspaceModel = ReturnType<typeof useWorkspaceModel>

function mergeLocalSelections(current: LocalSelection, next: LocalSelection): LocalSelection {
  const roots = new Map(current.roots.map((root) => [localPathKey(root), root]))
  for (const root of next.roots) {
    if (!roots.has(localPathKey(root))) roots.set(localPathKey(root), root)
  }
  const entries = new Map(current.entries.map((entry) => [localPathKey(entry.path), entry]))
  for (const entry of next.entries) {
    const existing = entries.get(localPathKey(entry.path))
    if (!existing || entry.depth > existing.depth) entries.set(localPathKey(entry.path), entry)
  }
  return {
    roots: [...roots.values()],
    entries: [...entries.values()],
    skippedSymlinks: current.skippedSymlinks + next.skippedSymlinks
  }
}

function addDefaultFolderRules(current: LocalFolderRule[], picked: LocalSelection): LocalFolderRule[] {
  const existing = new Set(current.map((rule) => localPathKey(rule.path)))
  const rootKeys = new Set(picked.roots.map(localPathKey))
  const additions = picked.entries
    .filter((entry) => entry.kind === 'folder' && rootKeys.has(localPathKey(entry.path)))
    .filter((entry) => !existing.has(localPathKey(entry.path)))
    .map((entry) => ({ path: entry.path, maxDepth: 0 }))
  return additions.length === 0 ? current : [...current, ...additions]
}

function updateLocalFolderRule(
  current: LocalFolderRule[],
  path: string,
  maxDepth: number | null | 'off'
): LocalFolderRule[] {
  const key = localPathKey(path)
  if (maxDepth === 'off') return current.filter((rule) => localPathKey(rule.path) !== key)
  const index = current.findIndex((rule) => localPathKey(rule.path) === key)
  if (index === -1) return [...current, { path, maxDepth }]
  return current.map((rule, ruleIndex) => ruleIndex === index ? { ...rule, maxDepth } : rule)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
