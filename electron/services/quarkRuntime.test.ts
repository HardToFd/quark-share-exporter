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
    await mkdir(join(bundled, 'quarklink'), { recursive: true })
    await mkdir(join(target, 'quarklink'), { recursive: true })
    await writeFile(
      join(bundled, 'manifest.json'),
      JSON.stringify({ files: { 'scripts/quark-drive.cjs': 'hash-placeholder' } })
    )
    await writeFile(join(bundled, 'scripts', 'quark-drive.cjs'), 'new runtime')
    await writeFile(join(bundled, 'quarklink', 'config.json'), 'must not be bundled')
    await writeFile(join(target, 'quarklink', 'config.json'), 'existing local account')

    await expect(prepareUserQuarkRuntime(bundled, target)).resolves.toBe(target)
    await expect(readFile(join(target, 'scripts', 'quark-drive.cjs'), 'utf8')).resolves.toBe(
      'new runtime'
    )
    await expect(readFile(join(target, 'quarklink', 'config.json'), 'utf8')).resolves.toBe(
      'existing local account'
    )
  })

  it('migrates a valid development login once and preserves it across runtime versions', async () => {
    const root = await makeTemporaryRoot()
    const developmentRuntime = join(root, 'development-runtime')
    const bundledV1 = join(root, 'bundled-v1')
    const bundledV2 = join(root, 'bundled-v2')
    const target = join(root, 'persistent-runtime')
    const config = JSON.stringify({
      currentUserId: 'account-1',
      agent_auth: { quarklink: { userId: 'account-1' } },
      'account-1': { accessToken: 'test-access-token' }
    })

    await mkdir(join(developmentRuntime, 'quarklink'), { recursive: true })
    await writeFile(join(developmentRuntime, 'quarklink', 'config.json'), config)
    await createBundledRuntime(bundledV1, 'runtime v1')
    await createBundledRuntime(bundledV2, 'runtime v2')

    await prepareUserQuarkRuntime(bundledV1, target, {
      legacyRuntimeRoots: [developmentRuntime]
    })
    await writeFile(
      join(developmentRuntime, 'quarklink', 'config.json'),
      config.replace('test-access-token', 'different-token')
    )
    await prepareUserQuarkRuntime(bundledV2, target, {
      legacyRuntimeRoots: [developmentRuntime]
    })

    await expect(readFile(join(target, 'quarklink', 'config.json'), 'utf8')).resolves.toBe(config)
    await expect(readFile(join(target, 'scripts', 'quark-drive.cjs'), 'utf8')).resolves.toBe(
      'runtime v2'
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

async function createBundledRuntime(path: string, script: string): Promise<void> {
  await mkdir(join(path, 'scripts'), { recursive: true })
  await writeFile(
    join(path, 'manifest.json'),
    JSON.stringify({ files: { 'scripts/quark-drive.cjs': 'hash-placeholder' } })
  )
  await writeFile(join(path, 'scripts', 'quark-drive.cjs'), script)
}
