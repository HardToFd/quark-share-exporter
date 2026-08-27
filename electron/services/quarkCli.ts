import { createHash } from 'node:crypto'
import { spawn, type ChildProcess } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { NdjsonAccumulator, type CliEnvelope } from './ndjson'

const CLOUD_LIST_BOOTSTRAP = `
const fs=require('node:fs')
const path=require('node:path')
const Module=require('node:module')
const scriptPath=process.argv[1]
if(!scriptPath)throw new Error('Missing verified CLI script path')
process.argv=[process.execPath,scriptPath,...process.argv.slice(2)]
let source=fs.readFileSync(scriptPath,'utf8')
const patches=[
  ['.option("--category <number>"','.option("--parent-fid <fid>","父目录 FID").option("--cursor <token>","分页游标").option("--category <number>"'],
  ['let l={keyword:r,size:n};','let l={keyword:r,size:n,parent_fid:e.parentFid,query_cursor:e.cursor};'],
  ['category:e.category,page:e.page}','category:e.category,page:e.page,parent_fid:e.parent_fid,query_cursor:e.query_cursor}'],
  ['a=[...i].slice(0,5)','a=[...i]'],
  ['let u=c.data?.file_list??[]','globalThis.__quarkListMeta={last_page:c.data?.last_page??true,next_query_cursor:c.data?.next_query_cursor??null};let u=c.data?.file_list??[]'],
  ['l={total:t,file_list:a};','l={total:t,file_list:a,...globalThis.__quarkListMeta};'],
  ['let t="/agent/v1/file/search",r=this.buildUrl(t)','let t="/open/v1/file/list",r=this.buildUrlWithParams(t,{fr:"ucpro-pc"})'],
  ['o={search_type:"mix",...e};return','o={parent_fid:e.parent_fid||"0",size:e.size||50,sort:"file_type:asc,updated_at:desc",fetch_total:1,...(e.query_cursor?{query_cursor:e.query_cursor}:{})};return']
]
for(const [from,to] of patches){
  const count=source.split(from).length-1
  if(count!==1)throw new Error('Unsupported official CLI search layout')
  source=source.replace(from,to)
}
const runner=new Module(scriptPath,module)
runner.filename=scriptPath
runner.paths=Module._nodeModulePaths(path.dirname(scriptPath))
runner._compile(source,scriptPath)
`.trim()

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
    return this.execute([runtime.scriptPath, command, ...args], runtime, options)
  }

  async listCloudFolderPage(
    parentFid: string,
    cursor: string | undefined,
    options: CliRunOptions
  ): Promise<CliRunResult> {
    const runtime = await this.verifyRuntime()
    const commandArgs = [
      '-e',
      CLOUD_LIST_BOOTSTRAP,
      runtime.scriptPath,
      'search',
      '--keyword',
      '*',
      '--size',
      '50',
      '--parent-fid',
      parentFid,
      '--stdout-only'
    ]
    if (cursor) commandArgs.push('--cursor', cursor)
    return this.execute(commandArgs, runtime, options)
  }

  private async execute(
    baseArgs: string[],
    runtime: VerifiedRuntime,
    options: CliRunOptions
  ): Promise<CliRunResult> {
    const commandArgs = [...baseArgs]
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
