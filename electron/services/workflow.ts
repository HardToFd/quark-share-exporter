import { randomBytes } from 'node:crypto'
import { dirname } from 'node:path'
import type {
  CloudEntry,
  LocalEntry,
  ShareExportRow,
  UploadTarget,
  WorkflowEvent,
  WorkflowRequest
} from '../../src/shared/types/desktop'
import {
  localPathKey,
  relativeLocalDepth,
  selectLocalShareEntries
} from '../../src/shared/lib/localFolderRules'
import type { CliEnvelope } from './ndjson'
import { exportRows } from './exporter'
import { QuarkCliRunner } from './quarkCli'
import { QuarkService } from './quarkService'
import {
  createSessionId,
  expiryLabel,
  mapUploadSuccesses,
  selectByScope,
  type MappedUpload,
  type UploadSuccess
} from './quarkData'

interface Candidate {
  fid: string
  name: string
  kind: 'file' | 'folder'
  size: number
  depth: number
  sourcePath: string
  cloudPath: string
  relativePath: string
  mappingConfidence?: 'exact' | 'ambiguous' | 'unmatched'
}

interface ActiveJob {
  cancelled: boolean
}

interface RemoteFolder {
  fid: string
  fullPath: string
}

type EventSink = (event: WorkflowEvent) => void

export class WorkflowService {
  private readonly jobs = new Map<string, ActiveJob>()

  constructor(
    private readonly runner: QuarkCliRunner,
    private readonly quark: QuarkService,
    private readonly emitToRenderer: EventSink
  ) {}

  start(request: WorkflowRequest): string {
    const jobId = `job-${Date.now()}-${randomBytes(3).toString('hex')}`
    this.jobs.set(jobId, { cancelled: false })
    void this.execute(jobId, request).finally(() => this.jobs.delete(jobId))
    return jobId
  }

  cancel(jobId: string): boolean {
    const job = this.jobs.get(jobId)
    if (!job) return false
    job.cancelled = true
    this.runner.cancel(jobId)
    this.emit(jobId, 'stage', 'cancelled', '正在停止当前任务，已完成的分享结果会保留', {
      level: 'warning'
    })
    return true
  }

  private async execute(jobId: string, request: WorkflowRequest): Promise<void> {
    const sessionId = createSessionId()
    const rows: ShareExportRow[] = []

    try {
      this.validateRequest(request)
      this.emit(jobId, 'stage', 'preflight', '正在校验官方 CLI 运行时与任务配置')
      await this.runner.verifyRuntime()

      const candidates =
        request.source.mode === 'local'
          ? await this.uploadLocalSource(jobId, sessionId, request)
          : this.selectCloudSource(jobId, request)

      if (this.isCancelled(jobId)) {
        this.emit(jobId, 'complete', 'cancelled', '任务已取消')
        return
      }
      if (candidates.length === 0) throw new Error('当前递归深度和类型筛选下没有可分享的项目')

      this.emit(jobId, 'stage', 'select', `已选中 ${candidates.length} 项，准备创建分享链接`, {
        current: candidates.length,
        total: candidates.length,
        percent: 100
      })
      this.emit(jobId, 'stage', 'share', '开始批量创建分享链接')

      if (request.share.granularity === 'bundle') {
        await this.shareBundles(jobId, sessionId, candidates, request, rows)
      } else {
        await this.shareItems(jobId, sessionId, candidates, request, rows)
      }

      if (rows.length === 0 && this.isCancelled(jobId)) {
        this.emit(jobId, 'complete', 'cancelled', '任务已取消，尚未产生可导出的分享结果')
        return
      }

      this.emit(jobId, 'stage', 'export', this.isCancelled(jobId) ? '正在导出已完成的部分结果' : '正在生成 CSV/Excel')
      const result = await exportRows(rows, request.export, request)
      const cancelled = this.isCancelled(jobId)
      this.emit(
        jobId,
        'complete',
        cancelled ? 'cancelled' : 'complete',
        cancelled
          ? `任务已取消，已导出 ${result.rowCount} 条部分结果`
          : `任务完成：成功 ${result.successCount} 项，失败 ${result.failedCount} 项`,
        { result, level: cancelled ? 'warning' : 'success', percent: cancelled ? undefined : 100 }
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : '任务执行失败'
      this.emit(jobId, 'error', this.isCancelled(jobId) ? 'cancelled' : 'complete', message, {
        level: 'error'
      })
    }
  }

  private async uploadLocalSource(
    jobId: string,
    sessionId: string,
    request: WorkflowRequest
  ): Promise<Candidate[]> {
    if (request.source.mode !== 'local') return []
    const selectedEntries = selectLocalShareEntries(
      request.source.roots,
      request.source.localEntries,
      request.source.folderRules
    )
    const selectedFolders = selectedEntries.filter((entry) => entry.kind === 'folder')
    const selectedFileKeys = new Set(
      selectedEntries.filter((entry) => entry.kind === 'file').map((entry) => localPathKey(entry.path))
    )
    const requiredFolders = requiredLocalFolders(request.source.localEntries, selectedFolders)
    const uploadFiles = requiredLocalFiles(request.source.localEntries, selectedFolders, selectedFileKeys)
    const localRootKeys = new Set(request.source.roots.map(localPathKey))
    const operationTotal = requiredFolders.length + uploadFiles.length
    let completedOperations = 0

    this.emit(
      jobId,
      'stage',
      'upload',
      `准备 ${requiredFolders.length} 个目录并上传 ${uploadFiles.length} 个文件`
    )

    const remoteFolders = new Map<string, RemoteFolder>()
    const candidatesByPath = new Map<string, Candidate>()
    const selectedFolderKeys = new Set(selectedFolders.map((entry) => localPathKey(entry.path)))

    for (const folder of requiredFolders) {
      if (this.isCancelled(jobId)) return []
      const parentFolder = remoteFolders.get(localPathKey(dirname(folder.path)))
      if (!parentFolder && !localRootKeys.has(localPathKey(folder.path))) {
        throw new Error(`无法定位“${folder.relativePath}”的父目录，已停止以避免上传结构错乱`)
      }

      const args = ['--dir-path', folder.name]
      appendParentFid(args, parentFolder ? { mode: 'fid', fid: parentFolder.fid } : request.source.uploadTarget)
      const run = await this.quark.runAuthorized('create-folder', args, {
        jobId,
        sessionId,
        onLog: (message) => this.emit(jobId, 'log', 'upload', message)
      })
      const data = (run.result?.data ?? {}) as Record<string, unknown>
      const fid = stringValue(data.fid)
      if (run.result?.code !== 0 || !fid) {
        throw new Error(run.result?.msg || run.stderr || `创建目录“${folder.relativePath}”失败`)
      }

      const remoteFolder = {
        fid,
        fullPath: stringValue(data.full_path) || joinCloudPath(parentFolder?.fullPath ?? '', folder.name)
      }
      remoteFolders.set(localPathKey(folder.path), remoteFolder)
      if (selectedFolderKeys.has(localPathKey(folder.path))) {
        candidatesByPath.set(localPathKey(folder.path), folderCandidate(folder, remoteFolder))
      }

      completedOperations += 1
      this.emitUploadProgress(jobId, completedOperations, operationTotal, `已创建目录 ${folder.relativePath}`)
    }

    const uploadGroups = groupLocalFilesByDestination(uploadFiles, selectedFolders, remoteFolders)
    let uploadSuccessCount = 0
    let hadUploadFailure = false
    for (const group of uploadGroups) {
      for (const chunk of chunkLocalFiles(group.files)) {
        if (this.isCancelled(jobId)) return []
        const args = chunk.map((entry) => entry.path)
        appendParentFid(args, group.remoteFolder
          ? { mode: 'fid', fid: group.remoteFolder.fid }
          : request.source.uploadTarget)

        const run = await this.quark.runAuthorized('upload', args, {
          jobId,
          sessionId,
          onLog: (message) => this.emit(jobId, 'log', 'upload', message)
        })
        const successes = run.envelopes
          .filter((envelope) => envelope.type === 'list' && envelope.code === 0)
          .map(uploadFromEnvelope)
          .filter((item): item is UploadSuccess => item !== null)
        uploadSuccessCount += successes.length
        hadUploadFailure ||= run.result?.code !== 0 || successes.length !== chunk.length

        const mapped = mapUploadSuccesses(chunk, successes)
        const resultData = (run.result?.data ?? {}) as Record<string, unknown>
        const returnedFullPath = stringValue(resultData.fullPath)
        const remoteDirectory = group.remoteFolder?.fullPath || cloudDirectoryFromResult(returnedFullPath)
        for (const item of mapped) {
          if (!selectedFileKeys.has(localPathKey(item.sourcePath))) continue
          candidatesByPath.set(
            localPathKey(item.sourcePath),
            mappedUploadCandidate(item, remoteDirectory)
          )
        }

        completedOperations += chunk.length
        this.emitUploadProgress(
          jobId,
          completedOperations,
          operationTotal,
          `已上传 ${Math.min(completedOperations - requiredFolders.length, uploadFiles.length)} / ${uploadFiles.length} 个文件`
        )

        if (run.result?.code !== 0 && !request.share.continueOnError) {
          throw new Error(run.result?.msg || run.stderr || '上传存在失败项，已按设置停止')
        }
      }
    }

    const candidates = selectedEntries.flatMap((entry) => {
      const candidate = candidatesByPath.get(localPathKey(entry.path))
      return candidate ? [candidate] : []
    })
    this.emit(
      jobId,
      'log',
      'upload',
      `已上传 ${uploadSuccessCount} 个文件，并取得 ${selectedFolders.length} 个目录 FID；可分享 ${candidates.length} 项`,
      { level: hadUploadFailure ? 'warning' : 'success' }
    )
    return candidates
  }

  private emitUploadProgress(jobId: string, current: number, total: number, message: string): void {
    this.emit(jobId, 'progress', 'upload', message, {
      current,
      total,
      percent: total === 0 ? 100 : Math.round((current / total) * 100)
    })
  }

  private selectCloudSource(jobId: string, request: WorkflowRequest): Candidate[] {
    if (request.source.mode !== 'cloud') return []
    if (request.source.searchTruncated) {
      this.emit(
        jobId,
        'log',
        'select',
        '本次检索已达到 3000 项上限，导出结果可能不是目录全集',
        { level: 'warning' }
      )
    }
    return selectByScope(request.source.cloudItems, request.scope).map(cloudCandidate)
  }

  private async shareItems(
    jobId: string,
    sessionId: string,
    candidates: Candidate[],
    request: WorkflowRequest,
    rows: ShareExportRow[]
  ): Promise<void> {
    let nextIndex = 0
    let halted = false
    const workerCount = Math.max(1, Math.min(3, request.share.concurrency))
    const workers = Array.from({ length: workerCount }, async () => {
      while (!halted && !this.isCancelled(jobId)) {
        const index = nextIndex
        nextIndex += 1
        if (index >= candidates.length) return
        const candidate = candidates[index]
        const row = await this.shareGroup(jobId, sessionId, [candidate], request, index)
        rows.push(...row)
        for (const item of row) this.emit(jobId, 'item', 'share', `${item.name}：${item.status === 'success' ? '分享成功' : '分享失败'}`, { row: item, level: item.status === 'success' ? 'success' : 'error' })
        this.emit(jobId, 'progress', 'share', `已处理 ${rows.length} / ${candidates.length}`, {
          current: rows.length,
          total: candidates.length,
          percent: Math.round((rows.length / candidates.length) * 100)
        })
        if (row.some((item) => item.status === 'failed') && !request.share.continueOnError) halted = true
      }
    })
    await Promise.all(workers)
    if (halted && !request.share.continueOnError) {
      this.emit(jobId, 'log', 'share', '遇到失败项，已停止创建后续链接；现有结果仍会导出', { level: 'warning' })
    }
  }

  private async shareBundles(
    jobId: string,
    sessionId: string,
    candidates: Candidate[],
    request: WorkflowRequest,
    rows: ShareExportRow[]
  ): Promise<void> {
    const bundleSize = Math.max(1, Math.min(100, request.share.bundleSize))
    const bundles: Candidate[][] = []
    for (let index = 0; index < candidates.length; index += bundleSize) {
      bundles.push(candidates.slice(index, index + bundleSize))
    }

    for (let index = 0; index < bundles.length; index += 1) {
      if (this.isCancelled(jobId)) return
      const groupRows = await this.shareGroup(jobId, sessionId, bundles[index], request, index)
      rows.push(...groupRows)
      for (const row of groupRows) this.emit(jobId, 'item', 'share', `${row.name}：${row.status === 'success' ? '分享成功' : '分享失败'}`, { row, level: row.status === 'success' ? 'success' : 'error' })
      this.emit(jobId, 'progress', 'share', `已完成 ${index + 1} / ${bundles.length} 组`, {
        current: index + 1,
        total: bundles.length,
        percent: Math.round(((index + 1) / bundles.length) * 100)
      })
      if (groupRows.some((row) => row.status === 'failed') && !request.share.continueOnError) {
        this.emit(jobId, 'log', 'share', '当前分组失败，已停止后续分组；现有结果仍会导出', { level: 'warning' })
        break
      }
    }
  }

  private async shareGroup(
    jobId: string,
    sessionId: string,
    candidates: Candidate[],
    request: WorkflowRequest,
    groupIndex: number
  ): Promise<ShareExportRow[]> {
    const args = candidates.map((candidate) => candidate.fid)
    const title = shareTitle(request.share.titlePrefix, candidates, groupIndex)
    if (title) args.push('--title', title)
    args.push('--url-type', request.share.visibility === 'public' ? '1' : '2')
    args.push('--expired-type', String(request.share.expiryType))

    const run = await this.quark.runAuthorized('share', args, {
      jobId,
      sessionId,
      onLog: (message) => this.emit(jobId, 'log', 'share', message)
    })
    const result = run.result
    const data = (result?.data ?? {}) as Record<string, unknown>
    const shareUrl = stringValue(data.share_url)
    const passcode = stringValue(data.passcode)
    const error = result?.code === 0 && shareUrl ? '' : result?.msg || run.stderr || '分享失败'
    const createdAt = new Date().toISOString()

    return candidates.map((candidate) => ({
      batchId: jobId,
      status: error ? 'failed' : 'success',
      source: request.source.mode,
      sourcePath: candidate.sourcePath,
      cloudPath: candidate.cloudPath,
      relativePath: candidate.relativePath,
      name: candidate.name,
      kind: candidate.kind,
      depth: candidate.depth,
      sizeBytes: candidate.size,
      fid: candidate.fid,
      shareScope: request.share.granularity,
      visibility: request.share.visibility,
      expiryLabel: expiryLabel(request.share.expiryType),
      shareUrl,
      passcode,
      createdAt,
      error,
      mappingConfidence: candidate.mappingConfidence
    }))
  }

  private validateRequest(request: WorkflowRequest): void {
    if (!request.export.outputDirectory.trim()) throw new Error('请选择导出目录')
    if (request.source.mode === 'cloud' && !request.scope.includeFiles && !request.scope.includeFolders) throw new Error('文件与文件夹至少选择一种')
    if (request.source.mode === 'local' && request.source.roots.length === 0) throw new Error('请先添加本机文件或文件夹')
    if (
      request.source.mode === 'local' &&
      selectLocalShareEntries(request.source.roots, request.source.localEntries, request.source.folderRules).length === 0
    ) {
      throw new Error('请至少启用一个目录打链规则，或添加一个单独文件')
    }
    if (request.source.mode === 'cloud' && request.source.cloudItems.length === 0) throw new Error('请先扫描网盘目录')
    if (request.source.mode === 'local' && request.source.uploadTarget.mode === 'default') {
      throw new Error('请选择上传目标目录：上传到网盘根目录，或从目录浏览器中选择文件夹')
    }
    if (request.source.mode === 'local' && request.source.uploadTarget.mode === 'fid' && !request.source.uploadTarget.fid.trim()) {
      throw new Error('请从网盘目录中选择上传目标；如需手动配置，可在高级设置中填写 FID')
    }
  }

  private isCancelled(jobId: string): boolean {
    return this.jobs.get(jobId)?.cancelled ?? true
  }

  private emit(
    jobId: string,
    type: WorkflowEvent['type'],
    stage: WorkflowEvent['stage'],
    message: string,
    extra: Partial<Omit<WorkflowEvent, 'jobId' | 'type' | 'stage' | 'message' | 'timestamp'>> = {}
  ): void {
    this.emitToRenderer({
      jobId,
      type,
      stage,
      message,
      timestamp: new Date().toISOString(),
      level: 'info',
      ...extra
    })
  }
}

function uploadFromEnvelope(envelope: CliEnvelope): UploadSuccess | null {
  const data = envelope.data as Record<string, unknown>
  const fid = stringValue(data.fileId)
  const fileName = stringValue(data.fileName)
  if (!fid || !fileName) return null
  return { fid, fileName, fileSize: finiteNumber(data.fileSize) }
}

function mappedUploadCandidate(item: MappedUpload, remoteDirectory: string): Candidate {
  return {
    fid: item.fid,
    name: item.fileName,
    kind: 'file',
    size: item.fileSize,
    depth: item.depth,
    sourcePath: item.sourcePath,
    cloudPath: joinCloudPath(remoteDirectory, item.fileName),
    relativePath: item.relativePath,
    mappingConfidence: item.mappingConfidence
  }
}

function folderCandidate(entry: LocalEntry, remote: RemoteFolder): Candidate {
  return {
    fid: remote.fid,
    name: entry.name,
    kind: 'folder',
    size: 0,
    depth: entry.depth,
    sourcePath: entry.path,
    cloudPath: remote.fullPath,
    relativePath: entry.relativePath
  }
}

function requiredLocalFolders(entries: LocalEntry[], selectedFolders: LocalEntry[]): LocalEntry[] {
  return entries
    .filter((entry) => entry.kind === 'folder')
    .filter((folder) => selectedFolders.some((selected) => (
      relativeLocalDepth(folder.path, selected.path) !== null ||
      relativeLocalDepth(selected.path, folder.path) !== null
    )))
    .sort((left, right) => localPathSegmentCount(left.path) - localPathSegmentCount(right.path) || localPathKey(left.path).localeCompare(localPathKey(right.path)))
}

function requiredLocalFiles(
  entries: LocalEntry[],
  selectedFolders: LocalEntry[],
  selectedFileKeys: Set<string>
): LocalEntry[] {
  return entries.filter((entry) => {
    if (entry.kind !== 'file') return false
    if (selectedFileKeys.has(localPathKey(entry.path))) return true
    return selectedFolders.some((folder) => relativeLocalDepth(folder.path, entry.path) !== null)
  })
}

function groupLocalFilesByDestination(
  files: LocalEntry[],
  selectedFolders: LocalEntry[],
  remoteFolders: Map<string, RemoteFolder>
): Array<{ remoteFolder?: RemoteFolder; files: LocalEntry[] }> {
  const groups = new Map<string, { remoteFolder?: RemoteFolder; files: LocalEntry[] }>()
  for (const file of files) {
    const localParentKey = localPathKey(dirname(file.path))
    const remoteFolder = remoteFolders.get(localParentKey)
    const belongsToFolder = selectedFolders.some((folder) => relativeLocalDepth(folder.path, file.path) !== null)
    if (belongsToFolder && !remoteFolder) {
      throw new Error(`无法定位“${file.relativePath}”的网盘父目录，已停止以避免文件被上传到错误位置`)
    }
    const groupKey = remoteFolder ? localParentKey : '__upload-target__'
    const group = groups.get(groupKey) ?? { remoteFolder, files: [] }
    group.files.push(file)
    groups.set(groupKey, group)
  }
  return [...groups.values()]
}

function localPathSegmentCount(path: string): number {
  return path.replace(/\\/g, '/').split('/').filter(Boolean).length
}

function chunkLocalFiles(entries: LocalEntry[]): LocalEntry[][] {
  const chunks: LocalEntry[][] = []
  let current: LocalEntry[] = []
  let currentLength = 0
  for (const entry of entries) {
    const argumentLength = entry.path.length + 3
    if (current.length >= 50 || (current.length > 0 && currentLength + argumentLength > 18_000)) {
      chunks.push(current)
      current = []
      currentLength = 0
    }
    current.push(entry)
    currentLength += argumentLength
  }
  if (current.length > 0) chunks.push(current)
  return chunks
}

function appendParentFid(args: string[], target: UploadTarget): void {
  if (target.mode === 'root') args.push('--parent-fid', '0')
  if (target.mode === 'fid') args.push('--parent-fid', target.fid)
}

function cloudDirectoryFromResult(fullPath: string): string {
  const normalized = fullPath.replace(/\\/g, '/').replace(/\/$/, '')
  const separator = normalized.lastIndexOf('/')
  return separator === -1 ? '' : normalized.slice(0, separator)
}

function joinCloudPath(parent: string, name: string): string {
  return [parent.replace(/\\/g, '/').replace(/\/$/, ''), name.replace(/^\/+/, '')]
    .filter(Boolean)
    .join('/')
}

function cloudCandidate(item: CloudEntry): Candidate {
  return {
    fid: item.fid,
    name: item.name,
    kind: item.kind,
    size: item.size,
    depth: item.depth,
    sourcePath: '',
    cloudPath: item.fullPath,
    relativePath: item.relativePath || item.name
  }
}

function shareTitle(prefix: string, candidates: Candidate[], groupIndex: number): string {
  const normalized = prefix.trim()
  if (!normalized) return ''
  const suffix = candidates.length === 1 ? candidates[0].name : `第 ${groupIndex + 1} 组`
  return `${normalized}-${suffix}`.slice(0, 100)
}

function finiteNumber(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}
