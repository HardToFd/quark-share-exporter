import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { prepareUserQuarkRuntime } from './quarkRuntime'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

describe('prepareUserQuarkRuntime', () => {
  it('updates manifested runtime files while preserving per-user account data', async () => {
    const root = await makeTemporaryRoot()
    const bundled = join(root, 'bundled')
    const target = join(root, 'user-runtime')
    await mkdir(join(bundled, 'scripts'), { recursive: true })
    await mkdir(join(bundled, 'codex'), { recursive: true })
    await mkdir(join(target, 'codex'), { recursive: true })
    await writeFile(
      join(bundled, 'manifest.json'),
      JSON.stringify({ files: { 'scripts/quark-drive.cjs': 'hash-placeholder' } })
    )
    await writeFile(join(bundled, 'scripts', 'quark-drive.cjs'), 'new runtime')
    await writeFile(join(bundled, 'codex', 'config.json'), 'must not be bundled')
    await writeFile(join(target, 'codex', 'config.json'), 'existing local account')

    await expect(prepareUserQuarkRuntime(bundled, target)).resolves.toBe(target)
    await expect(readFile(join(target, 'scripts', 'quark-drive.cjs'), 'utf8')).resolves.toBe(
      'new runtime'
    )
    await expect(readFile(join(target, 'codex', 'config.json'), 'utf8')).resolves.toBe(
      'existing local account'
    )
  })

  it('rejects manifest paths outside the bundled runtime', async () => {
    const root = await makeTemporaryRoot()
    const bundled = join(root, 'bundled')
    await mkdir(bundled, { recursive: true })
    await writeFile(join(bundled, 'manifest.json'), JSON.stringify({ files: { '../escape.cjs': 'hash' } }))

    await expect(prepareUserQuarkRuntime(bundled, join(root, 'target'))).rejects.toThrow(
      'manifest 路径越界'
    )
  })
})

async function makeTemporaryRoot(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'quark-runtime-test-'))
  temporaryRoots.push(path)
  return path
}
