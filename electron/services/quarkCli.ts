import { createHash } from 'node:crypto'
import { spawn, type ChildProcess } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { NdjsonAccumulator, type CliEnvelope } from './ndjson'

interface RuntimeManifest {
  skillVersion: string
  cliVersion: string
  files: Record<string, string>
}

export interface CliRunResult {
  envelopes: CliEnvelope[]
  result?: CliEnvelope
  exitCode: number
  stderr: string
}

export interface CliRunOptions {
  jobId: string
  sessionId: string
  sessionInput?: string
  onEnvelope?: (envelope: CliEnvelope) => void
  onLog?: (message: string) => void
}

export interface VerifiedRuntime {
  root: string
  scriptPath: string
  skillVersion: string
  cliVersion: string
}

export class QuarkCliRunner {
  private readonly active = new Map<string, Set<ChildProcess>>()
  private verified?: VerifiedRuntime

  constructor(private readonly runtimeRoot: string) {}

  async verifyRuntime(): Promise<VerifiedRuntime> {
    if (this.verified) return this.verified

    const manifestPath = join(this.runtimeRoot, 'manifest.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as RuntimeManifest
    for (const [relativePath, expectedHash] of Object.entries(manifest.files)) {
      const bytes = await readFile(join(this.runtimeRoot, relativePath))
      const actualHash = createHash('sha256').update(bytes).digest('hex')
      if (actualHash !== expectedHash.toLowerCase()) {
        throw new Error(`官方 CLI 运行时校验失败：${relativePath}`)
      }
    }

    this.verified = {
      root: this.runtimeRoot,
      scriptPath: join(this.runtimeRoot, 'scripts', 'quark-drive.cjs'),
      skillVersion: manifest.skillVersion,
      cliVersion: manifest.cliVersion
    }
    return this.verified
  }

  async run(command: string, args: string[], options: CliRunOptions): Promise<CliRunResult> {
    const runtime = await this.verifyRuntime()
    const commandArgs = [runtime.scriptPath, command, ...args]
    if (options.sessionInput) commandArgs.push('--session-input', options.sessionInput)
    commandArgs.push('--session-id', options.sessionId)

    const child = spawn(process.execPath, commandArgs, {
      cwd: join(this.runtimeRoot, 'scripts'),
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        NO_COLOR: '1'
      },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    this.track(options.jobId, child)

    const stdout = new NdjsonAccumulator()
    const stderr = new NdjsonAccumulator()
    const envelopes: CliEnvelope[] = []
    let stderrText = ''

    const consumeStdout = (chunk: Buffer | string): void => {
      for (const line of stdout.push(String(chunk))) {
        if (line.parsed) {
          envelopes.push(line.parsed)
          options.onEnvelope?.(line.parsed)
        } else if (line.raw.trim()) {
          options.onLog?.(line.raw.trim())
        }
      }
    }
    const consumeStderr = (chunk: Buffer | string): void => {
      const value = String(chunk)
      stderrText = `${stderrText}${value}`.slice(-20_000)
      for (const line of stderr.push(value)) {
        if (line.raw.trim()) options.onLog?.(line.raw.trim())
      }
    }

    child.stdout.on('data', consumeStdout)
    child.stderr.on('data', consumeStderr)

    const exitCode = await new Promise<number>((resolve, reject) => {
      child.once('error', reject)
      child.once('close', (code) => resolve(code ?? 1))
    }).finally(() => this.untrack(options.jobId, child))

    for (const line of stdout.flush()) {
      if (line.parsed) {
        envelopes.push(line.parsed)
        options.onEnvelope?.(line.parsed)
      }
    }
    for (const line of stderr.flush()) {
      if (line.raw.trim()) options.onLog?.(line.raw.trim())
    }

    const result = [...envelopes].reverse().find((envelope) => envelope.type === 'result')
    return { envelopes, result, exitCode, stderr: stderrText.trim() }
  }

  cancel(jobId: string): boolean {
    const processes = this.active.get(jobId)
    if (!processes?.size) return false
    for (const child of processes) {
      if (!child.killed) child.kill(process.platform === 'win32' ? undefined : 'SIGINT')
    }
    return true
  }

  private track(jobId: string, child: ChildProcess): void {
    const processes = this.active.get(jobId) ?? new Set<ChildProcess>()
    processes.add(child)
    this.active.set(jobId, processes)
  }

  private untrack(jobId: string, child: ChildProcess): void {
    const processes = this.active.get(jobId)
    if (!processes) return
    processes.delete(child)
    if (processes.size === 0) this.active.delete(jobId)
  }
}
