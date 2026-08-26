import { randomBytes } from 'node:crypto'
import type {
  CloudEntry,
  ShareExportRow,
  WorkflowEvent,
  WorkflowRequest
} from '../../src/shared/types/desktop'
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
      this.emit(
        jobId,
        'complete',
        this.isCancelled(jobId) ? 'cancelled' : 'complete',
        this.isCancelled(jobId)
          ? `任务已取消，已导出 ${result.rowCount} 条部分结果`
          : `任务完成：成功 ${result.successCount} 项，失败 ${result.failedCount} 项`,
        { result, level: this.isCancelled(jobId) ? 'warning' : 'success' }
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
    this.emit(jobId, 'stage', 'upload', `开始上传 ${request.source.roots.length} 个本机入口`)

    const args = [...request.source.roots]
    if (request.source.uploadTarget.mode === 'root') {
      args.push('--parent-fid', '0')
    } else if (request.source.uploadTarget.mode === 'fid') {
      args.push('--parent-fid', request.source.uploadTarget.fid)
    }

    const run = await this.quark.runAuthorized('upload', args, {
      jobId,
      sessionId,
      onLog: (message) => this.emit(jobId, 'log', 'upload', message),
      onEnvelope: (envelope) => {
        if (envelope.type !== 'progress') return
        const data = envelope.data as Record<string, unknown>
        const percent = finiteNumber(data.percent)
        this.emit(jobId, 'progress', 'upload', envelope.msg || '正在上传', {
          current: finiteNumber(data.current),
          total: finiteNumber(data.total),
          percent
        })
      }
    })

    const successes = run.envelopes
      .filter((envelope) => envelope.type === 'list' && envelope.code === 0)
      .map(uploadFromEnvelope)
      .filter((item): item is UploadSuccess => item !== null)
    if (successes.length === 0 && run.result?.code !== 0) {
      throw new Error(run.result?.msg || run.stderr || '上传失败')
    }
    if (run.result?.code !== 0 && !request.share.continueOnError) {
      throw new Error(run.result?.msg || '上传存在失败项，已按设置停止')
    }

    const fullPath = stringValue((run.result?.data as Record<string, unknown> | undefined)?.fullPath)
    const mapped = mapUploadSuccesses(request.source.localEntries, successes)
    const candidates = mapped.map((item) => mappedUploadCandidate(item, fullPath))
    const selected = selectByScope(candidates, {
      ...request.scope,
      includeFolders: false
    })
    this.emit(jobId, 'log', 'upload', `上传成功 ${successes.length} 个文件，可分享 ${selected.length} 个`, {
      level: run.result?.code === 0 ? 'success' : 'warning'
    })
    return selected
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
    if (!request.scope.includeFiles && !request.scope.includeFolders) throw new Error('文件与文件夹至少选择一种')
    if (request.source.mode === 'local' && request.source.roots.length === 0) throw new Error('请先添加本机文件或文件夹')
    if (request.source.mode === 'cloud' && request.source.cloudItems.length === 0) throw new Error('请先扫描网盘目录')
    if (request.source.mode === 'local' && request.source.uploadTarget.mode === 'fid' && !request.source.uploadTarget.fid.trim()) {
      throw new Error('请输入目标网盘目录 FID')
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

function mappedUploadCandidate(item: MappedUpload, fullPath: string): Candidate {
  const cloudPath = [fullPath.replace(/\/$/, ''), item.relativePath].filter(Boolean).join('/')
  return {
    fid: item.fid,
    name: item.fileName,
    kind: 'file',
    size: item.fileSize,
    depth: item.depth,
    sourcePath: item.sourcePath,
    cloudPath,
    relativePath: item.relativePath,
    mappingConfidence: item.mappingConfidence
  }
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
