import { basename, join } from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import type { LocalEntry, WorkflowEvent, WorkflowRequest } from '../../src/shared/types/desktop'
import type { CliEnvelope } from './ndjson'
import type { CliRunResult, QuarkCliRunner } from './quarkCli'
import type { QuarkService } from './quarkService'
import { WorkflowService } from './workflow'

describe('local folder workflow', () => {
  it('shares the selected folder FID once while uploading its files as contents', async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), 'quark-folder-workflow-'))
    const root = 'C:\\Fixture\\Parent'
    const entries: LocalEntry[] = [
      entry(root, root, 'Parent', 'folder', 0, 0),
      entry(`${root}\\root.txt`, root, 'root.txt', 'file', 10, 1),
      entry(`${root}\\Child`, root, 'Child', 'folder', 0, 1),
      entry(`${root}\\Child\\nested.txt`, root, 'nested.txt', 'file', 20, 2)
    ]
    const calls: Array<{ command: string; args: string[] }> = []
    const events: WorkflowEvent[] = []
    let folderSequence = 0

    const runner = {
      verifyRuntime: async () => ({ root: '', scriptPath: '', skillVersion: 'test', cliVersion: 'test' }),
      cancel: () => true
    } as unknown as QuarkCliRunner
    const quark = {
      runAuthorized: async (command: string, args: string[]): Promise<CliRunResult> => {
        calls.push({ command, args: [...args] })
        if (command === 'create-folder') {
          folderSequence += 1
          const name = args[args.indexOf('--dir-path') + 1]
          return cliResult({ fid: `folder-${folderSequence}`, full_path: `夸克网盘/${name}` })
        }
        if (command === 'upload') {
          const parentIndex = args.indexOf('--parent-fid')
          const paths = parentIndex === -1 ? args : args.slice(0, parentIndex)
          const envelopes: CliEnvelope[] = paths.map((path, index) => {
            const source = entries.find((candidate) => candidate.path === path)!
            return {
              code: 0,
              msg: '上传成功',
              action: 'upload',
              type: 'list',
              data: {
                recordId: `record-${index}`,
                fileId: `file-${source.name}`,
                fileName: source.name,
                fileSize: source.size
              }
            }
          })
          const result = resultEnvelope('upload', { fullPath: `夸克网盘/${basename(paths[0])}` })
          return { envelopes: [...envelopes, result], result, exitCode: 0, stderr: '' }
        }
        if (command === 'share') return cliResult({ share_url: 'https://pan.quark.cn/s/folder' }, 'share')
        throw new Error(`Unexpected command: ${command}`)
      }
    } as unknown as QuarkService

    const completion = new Promise<void>((resolve) => {
      const service = new WorkflowService(runner, quark, (event) => {
        events.push(event)
        if (event.type === 'complete' || event.type === 'error') resolve()
      })
      service.start(localRequest(root, entries, outputDirectory))
    })

    try {
      await Promise.race([
        completion,
        new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error('workflow timeout')), 3_000))
      ])

      const shareCalls = calls.filter((call) => call.command === 'share')
      expect(shareCalls).toHaveLength(1)
      expect(shareCalls[0].args[0]).toBe('folder-1')
      expect(shareCalls[0].args).not.toContain('file-root.txt')
      expect(shareCalls[0].args).not.toContain('file-nested.txt')
      expect(calls.filter((call) => call.command === 'create-folder')).toHaveLength(2)

      const sharedRow = events.find((event) => event.type === 'item')?.row
      expect(sharedRow).toMatchObject({ kind: 'folder', name: 'Parent', sourcePath: root })
      expect(events.at(-1)?.type).toBe('complete')
    } finally {
      await rm(outputDirectory, { recursive: true, force: true })
    }
  })
})

function localRequest(root: string, entries: LocalEntry[], outputDirectory: string): WorkflowRequest {
  return {
    source: {
      mode: 'local',
      roots: [root],
      localEntries: entries,
      folderRules: [{ path: root, maxDepth: 0 }],
      uploadTarget: { mode: 'default' }
    },
    scope: { maxDepth: null, includeRoot: false, includeFiles: true, includeFolders: false },
    share: {
      granularity: 'per-item',
      visibility: 'public',
      expiryType: 1,
      titlePrefix: '测试',
      bundleSize: 100,
      concurrency: 1,
      continueOnError: true
    },
    export: { format: 'csv', outputDirectory, fileName: 'folder-links' }
  }
}

function entry(
  path: string,
  rootPath: string,
  name: string,
  kind: 'file' | 'folder',
  size: number,
  depth: number
): LocalEntry {
  return { path, rootPath, name, kind, size, relativePath: path.slice(rootPath.length).replace(/^\\/, '') || name, depth }
}

function cliResult(data: Record<string, unknown>, action = 'create-folder'): CliRunResult {
  const result = resultEnvelope(action, data)
  return { envelopes: [result], result, exitCode: 0, stderr: '' }
}

function resultEnvelope(action: string, data: Record<string, unknown>): CliEnvelope {
  return { code: 0, msg: 'ok', action, type: 'result', data }
}
