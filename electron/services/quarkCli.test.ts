import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { QuarkCliRunner } from './quarkCli'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

describe('QuarkCliRunner.listCloudFolderPage', () => {
  it('boots the verified CLI with folder and cursor arguments', async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), 'quark-cli-list-test-'))
    temporaryRoots.push(runtimeRoot)
    await mkdir(join(runtimeRoot, 'scripts'), { recursive: true })

    const script = `/*
.option("--category <number>"
let l={keyword:r,size:n};
category:e.category,page:e.page}
a=[...i].slice(0,5)
let u=c.data?.file_list??[]
l={total:t,file_list:a};
let t="/agent/v1/file/search",r=this.buildUrl(t)
o={search_type:"mix",...e};return
*/
process.stdout.write(JSON.stringify({code:0,msg:"ok",data:{argv:process.argv.slice(2)},action:"search",type:"result"})+"\\n")
`
    const scriptHash = createHash('sha256').update(script).digest('hex')
    await writeFile(join(runtimeRoot, 'scripts', 'quark-drive.cjs'), script)
    await writeFile(
      join(runtimeRoot, 'manifest.json'),
      JSON.stringify({
        skillVersion: 'test-skill',
        cliVersion: 'test-cli',
        files: { 'scripts/quark-drive.cjs': scriptHash }
      })
    )

    const runner = new QuarkCliRunner(runtimeRoot)
    const run = await runner.listCloudFolderPage('folder-x', 'cursor-y', {
      jobId: 'test-job',
      sessionId: 'test-session',
      sessionInput: 'test-input'
    })

    expect(run.exitCode, run.stderr).toBe(0)
    expect(run.stderr).toBe('')
    const argv = (run.result?.data as { argv?: string[] } | undefined)?.argv
    expect(argv).toEqual([
      'search',
      '--keyword',
      '*',
      '--size',
      '50',
      '--parent-fid',
      'folder-x',
      '--stdout-only',
      '--cursor',
      'cursor-y',
      '--session-input',
      'test-input',
      '--session-id',
      'test-session'
    ])
  })
})

describe('QuarkCliRunner.verifyRuntime', () => {
  it('verifies the real bundled runtime against its manifest', async () => {
    const runtime = await new QuarkCliRunner(resolve('vendor/quark-drive')).verifyRuntime()

    expect(runtime.skillVersion).toBe('1.0.15')
    expect(runtime.scriptPath).toBe(resolve('vendor/quark-drive/scripts/quark-drive.cjs'))
  })

  it('accepts a CRLF checkout when the manifest hashes canonical LF source', async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), 'quark-cli-crlf-test-'))
    temporaryRoots.push(runtimeRoot)
    await mkdir(join(runtimeRoot, 'scripts'), { recursive: true })

    const canonicalScript = '#!/usr/bin/env node\nprocess.stdout.write("ok\\n")\n'
    const expectedHash = createHash('sha256').update(canonicalScript).digest('hex')
    await writeFile(
      join(runtimeRoot, 'scripts', 'quark-drive.cjs'),
      canonicalScript.replace(/\n/g, '\r\n')
    )
    await writeFile(
      join(runtimeRoot, 'manifest.json'),
      JSON.stringify({
        skillVersion: 'test-skill',
        cliVersion: 'test-cli',
        files: { 'scripts/quark-drive.cjs': expectedHash }
      })
    )

    await expect(new QuarkCliRunner(runtimeRoot).verifyRuntime()).resolves.toMatchObject({
      skillVersion: 'test-skill',
      cliVersion: 'test-cli'
    })
  })

  it('still rejects runtime content changes', async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), 'quark-cli-tamper-test-'))
    temporaryRoots.push(runtimeRoot)
    await mkdir(join(runtimeRoot, 'scripts'), { recursive: true })

    const expectedHash = createHash('sha256').update('expected\n').digest('hex')
    await writeFile(join(runtimeRoot, 'scripts', 'quark-drive.cjs'), 'modified\r\n')
    await writeFile(
      join(runtimeRoot, 'manifest.json'),
      JSON.stringify({
        skillVersion: 'test-skill',
        cliVersion: 'test-cli',
        files: { 'scripts/quark-drive.cjs': expectedHash }
      })
    )

    await expect(new QuarkCliRunner(runtimeRoot).verifyRuntime()).rejects.toThrow(
      '官方 CLI 运行时校验失败：scripts/quark-drive.cjs'
    )
  })
})
