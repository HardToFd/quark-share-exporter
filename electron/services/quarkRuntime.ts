import { copyFile, mkdir, readFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'

interface RuntimeManifest {
  files: Record<string, string>
}

/**
 * Copies only integrity-manifested runtime files into a stable, writable
 * per-user directory. Existing account and storage directories are preserved.
 */
export async function prepareUserQuarkRuntime(
  bundledRoot: string,
  userRuntimeRoot: string
): Promise<string> {
  const bundled = resolve(bundledRoot)
  const target = resolve(userRuntimeRoot)
  if (bundled === target) return target

  const manifestSource = containedPath(bundled, 'manifest.json')
  const manifest = parseManifest(await readFile(manifestSource, 'utf8'))

  await mkdir(target, { recursive: true })
  for (const relativePath of Object.keys(manifest.files)) {
    const sourcePath = containedPath(bundled, relativePath)
    const targetPath = containedPath(target, relativePath)
    await mkdir(dirname(targetPath), { recursive: true })
    await copyFile(sourcePath, targetPath)
  }

  // Publish the manifest last so an interrupted update cannot make a partial
  // runtime look current to the integrity verifier.
  await copyFile(manifestSource, containedPath(target, 'manifest.json'))
  return target
}

function parseManifest(raw: string): RuntimeManifest {
  const value = JSON.parse(raw) as Partial<RuntimeManifest>
  if (!value.files || typeof value.files !== 'object' || Array.isArray(value.files)) {
    throw new Error('官方 CLI manifest 缺少文件清单')
  }
  if (Object.keys(value.files).length === 0) {
    throw new Error('官方 CLI manifest 文件清单为空')
  }
  return { files: value.files }
}

function containedPath(root: string, relativePath: string): string {
  if (!relativePath || isAbsolute(relativePath)) {
    throw new Error(`官方 CLI manifest 路径无效：${relativePath || '(空路径)'}`)
  }

  const candidate = resolve(root, relativePath)
  const fromRoot = relative(root, candidate)
  if (fromRoot === '..' || fromRoot.startsWith(`..\\`) || fromRoot.startsWith('../')) {
    throw new Error(`官方 CLI manifest 路径越界：${relativePath}`)
  }
  return candidate
}
