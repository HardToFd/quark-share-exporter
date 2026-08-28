import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import type {
  AccountInfo,
  CloudListRequest,
  CloudListResult,
  CloudScanRequest,
  CloudScanResult,
  LoginResult,
  RuntimeStatus
} from '../../src/shared/types/desktop'
import { QuarkCliRunner, type CliRunOptions, type CliRunResult } from './quarkCli'
import {
  createSessionId,
  extractAuthorizationUrl,
  isAuthenticationError,
  normalizeCloudListItems,
  normalizeCloudItems,
  type RawCloudItem
} from './quarkData'

type ActivityListener = (message: string) => void

export class QuarkService {
  private authentication?: Promise<boolean>

  constructor(
    private readonly runner: QuarkCliRunner,
    private readonly activity: ActivityListener
  ) {}

  async runtimeStatus(): Promise<RuntimeStatus> {
    try {
      const runtime = await this.runner.verifyRuntime()
      return {
        available: true,
        verified: true,
        skillVersion: runtime.skillVersion,
        cliVersion: runtime.cliVersion,
        message: '官方 CLI 完整性校验通过，QuarkLink 身份适配已启用'
      }
    } catch (error) {
      return {
        available: false,
        verified: false,
        skillVersion: '',
        cliVersion: '',
        message: error instanceof Error ? error.message : 'CLI 运行时不可用'
      }
    }
  }

  async getAccountInfo(): Promise<AccountInfo> {
    const run = await this.runner.run('get-user-info', [], {
      jobId: `account-${Date.now()}`,
      sessionId: createSessionId(),
      onLog: this.activity
    })
    const result = run.result
    if (!result || result.code !== 0) {
      return {
        authenticated: false,
        message: result?.msg || run.stderr || '未检测到有效授权'
      }
    }

    const data = result.data as Record<string, unknown>
    const user = pickRecord(data, ['user', 'userInfo', 'user_info']) ?? data
    const member = pickRecord(data, ['member', 'memberInfo', 'member_info', 'vip']) ?? data
    const capacity = pickRecord(data, ['capacity', 'capacityInfo', 'capacity_info']) ?? data
    const nickname = pickString(user, ['nickname', 'nickName', 'name'])
    const rawMembership = pickString(member, ['member_type', 'memberType', 'vip_type', 'vipType', 'type'])

    return {
      authenticated: true,
      nickname: nickname || '已授权账号',
      membership: membershipLabel(rawMembership),
      usedBytes: pickNumber(capacity, ['use_size', 'used_size', 'usedBytes', 'used']),
      totalBytes: pickNumber(capacity, ['total_size', 'totalBytes', 'total']),
      message: result.msg || '账号授权有效'
    }
  }

  async login(token?: string): Promise<LoginResult> {
    const run = await this.runLogin(token)
    const result = run.result
    const success = result?.code === 0 || result?.code === -118
    const message = result?.msg || run.stderr || (success ? '授权成功' : '授权未完成')
    return {
      success,
      needsManualCode: !success,
      authorizationUrl: extractAuthorizationUrl(message) || extractAuthorizationUrl(run.stderr),
      message
    }
  }

  async scanCloud(request: CloudScanRequest): Promise<CloudScanResult> {
    const query = request.query.trim()
    if (!query) throw new Error('请输入要扫描的网盘目录名称或完整路径')
    if (query.length > 50) throw new Error('目录检索描述不能超过 50 个字符')

    const sessionId = createSessionId()
    const run = await this.runAuthorized(
      'search',
      ['--keyword', query, '--size', '3000'],
      {
        jobId: `scan-${Date.now()}`,
        sessionId,
        sessionInput: query,
        onLog: this.activity
      }
    )
    const result = run.result
    if (!result || result.code !== 0) {
      throw new Error(result?.msg || run.stderr || '目录扫描失败')
    }

    const resultData = result.data as Record<string, unknown>
    const artifact = run.envelopes.find((envelope) => envelope.type === 'artifact')
    const artifactPath = artifact ? pickString(artifact.data as Record<string, unknown>, ['file_path']) : undefined
    const rawItems = artifactPath
      ? await readArtifact(artifactPath)
      : (((resultData.file_list as RawCloudItem[] | undefined) ?? []) as RawCloudItem[])
    const allNormalized = normalizeCloudItems(rawItems)
    const filtered = normalizeCloudItems(rawItems, request.pathPrefix)
    const total = pickNumber(resultData, ['total']) ?? rawItems.length
    const truncated = total > rawItems.length

    return {
      query,
      total,
      returned: filtered.length,
      truncated,
      items: filtered,
      folderCandidates: allNormalized.filter((item) => item.kind === 'folder'),
      artifactAvailable: Boolean(artifactPath),
      checkAllLink: pickString(resultData, ['check_all_link']),
      browseHint: pickString(resultData, ['browse_hint']),
      message:
        total === 0
          ? `未找到与“${query}”匹配的目录或文件`
          : truncated
            ? `官方接口共匹配 ${total} 项，本次已加载 ${rawItems.length} 项`
            : `已加载全部 ${rawItems.length} 项`
    }
  }

  async listCloudFolder(request: CloudListRequest): Promise<CloudListResult> {
    const parentFid = request.parentFid.trim()
    if (!parentFid || parentFid.length > 512) throw new Error('网盘父目录 FID 无效')
    if (request.parentPath.length > 4_000) throw new Error('网盘目录路径过长')
    if (request.ancestorFids.length > 100 || request.ancestorFids.some((fid) => !fid || fid.length > 512)) {
      throw new Error('网盘目录层级无效')
    }

    const sessionId = createSessionId()
    const jobId = `cloud-list-${Date.now()}`
    const rawItems: RawCloudItem[] = []
    const seenCursors = new Set<string>()
    let cursor: string | undefined
    let pageCount = 0
    let complete = false

    while (pageCount < 200) {
      const run = await this.runCloudListAuthorized(parentFid, cursor, {
        jobId,
        sessionId,
        sessionInput: '逐层浏览网盘目录',
        onLog: this.activity
      })
      const result = run.result
      if (!result || result.code !== 0) {
        throw new Error(result?.msg || run.stderr || '读取网盘目录失败')
      }

      const data = result.data && typeof result.data === 'object'
        ? result.data as Record<string, unknown>
        : {}
      const pageItems = ((data.file_list as RawCloudItem[] | undefined) ?? []) as RawCloudItem[]
      rawItems.push(...pageItems)
      pageCount += 1

      const nextCursor = pickString(data, ['next_query_cursor'])
      const lastPage = data.last_page !== false
      if (lastPage || !nextCursor) {
        complete = true
        break
      }
      if (seenCursors.has(nextCursor)) throw new Error('网盘目录分页游标重复，已停止读取')
      seenCursors.add(nextCursor)
      cursor = nextCursor
      this.activity(`正在加载目录下一页（已读取 ${rawItems.length} 项）`)
    }

    if (!complete) throw new Error('网盘目录分页超过安全上限')
    const uniqueItems = [...new Map(rawItems.map((item) => [String(item.fid ?? ''), item])).values()]
      .filter((item) => Boolean(item.fid))
    const items = normalizeCloudListItems(uniqueItems, {
      parentFid,
      parentPath: request.parentPath,
      ancestorFids: request.ancestorFids
    })

    return {
      parentFid,
      items,
      pageCount,
      message: `已读取 ${request.parentPath || '网盘根目录'} 的 ${items.length} 个直接子项`
    }
  }

  async runAuthorized(
    command: string,
    args: string[],
    options: CliRunOptions
  ): Promise<CliRunResult> {
    const first = await this.runner.run(command, args, options)
    if (!isAuthenticationError(first.result?.msg ?? first.stderr, first.result?.code)) return first

    this.activity(first.result?.msg || '当前授权无效，正在打开夸克网盘授权页')
    const authenticated = await this.authenticateOnce()
    if (!authenticated) return first
    this.activity('授权成功，正在继续刚才的操作')
    return this.runner.run(command, args, options)
  }

  private async runCloudListAuthorized(
    parentFid: string,
    cursor: string | undefined,
    options: CliRunOptions
  ): Promise<CliRunResult> {
    const first = await this.runner.listCloudFolderPage(parentFid, cursor, options)
    if (!isAuthenticationError(first.result?.msg ?? first.stderr, first.result?.code)) return first

    this.activity(first.result?.msg || '当前授权无效，正在打开夸克网盘授权页')
    const authenticated = await this.authenticateOnce()
    if (!authenticated) return first
    this.activity('授权成功，正在继续读取网盘目录')
    return this.runner.listCloudFolderPage(parentFid, cursor, options)
  }

  private async authenticateOnce(): Promise<boolean> {
    if (!this.authentication) {
      this.authentication = this.runLogin()
        .then((run) => run.result?.code === 0 || run.result?.code === -118)
        .finally(() => {
          this.authentication = undefined
        })
    }
    return this.authentication
  }

  private runLogin(token?: string): Promise<CliRunResult> {
    return this.runner.run('login', token ? ['--token', token] : [], {
      jobId: `login-${Date.now()}`,
      sessionId: createSessionId(),
      sessionInput: token ? undefined : '授权夸克网盘',
      onLog: this.activity
    })
  }
}

async function readArtifact(path: string): Promise<RawCloudItem[]> {
  const items: RawCloudItem[] = []
  const input = createReadStream(path, { encoding: 'utf8' })
  const lines = createInterface({ input, crlfDelay: Infinity })
  for await (const line of lines) {
    if (!line.trim()) continue
    try {
      items.push(JSON.parse(line) as RawCloudItem)
    } catch {
      // A corrupt line is ignored; the returned count still exposes the discrepancy.
    }
  }
  return items
}

function pickRecord(source: Record<string, unknown>, keys: string[]): Record<string, unknown> | undefined {
  for (const key of keys) {
    const value = source[key]
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  }
  return undefined
}

function pickString(source: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

function pickNumber(source: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = Number(source[key])
    if (Number.isFinite(value)) return value
  }
  return undefined
}

function membershipLabel(value?: string): string {
  const normalized = value?.toUpperCase()
  if (normalized === 'SVIP') return '超级会员'
  if (normalized === 'VIP') return '会员'
  if (normalized === 'NORMAL') return '普通用户'
  return value || '会员状态未知'
}
