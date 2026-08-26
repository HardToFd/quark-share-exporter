import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import type {
  AccountInfo,
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
        message: '官方 CLI 运行时完整性校验通过'
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

    return {
      query,
      total,
      returned: filtered.length,
      truncated: total >= 3000,
      items: filtered,
      folderCandidates: allNormalized.filter((item) => item.kind === 'folder'),
      artifactAvailable: Boolean(artifactPath),
      checkAllLink: pickString(resultData, ['check_all_link']),
      browseHint: pickString(resultData, ['browse_hint']),
      message:
        total === 0
          ? `未找到与“${query}”匹配的目录或文件`
          : `检索返回 ${total} 项，路径范围内 ${filtered.length} 项`
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
