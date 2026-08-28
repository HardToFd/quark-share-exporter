import { join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import type {
  CloudListRequest,
  CloudScanRequest,
  WorkflowEvent,
  WorkflowRequest
} from '../../src/shared/types/desktop'
import { pickLocalEntries } from '../services/localFiles'
import { QuarkCliRunner } from '../services/quarkCli'
import { prepareUserQuarkRuntime } from '../services/quarkRuntime'
import { QuarkService } from '../services/quarkService'
import { WorkflowService } from '../services/workflow'

let mainWindow: BrowserWindow | null = null
const smokeMode = process.argv.includes('--smoke-test')
const persistentUserDataRoot = join(app.getPath('appData'), 'quark-share-exporter')

// Keep Electron state and the official CLI account configuration stable across
// development, installed, and portable builds.
app.setPath('userData', persistentUserDataRoot)

async function runtimeRoot(): Promise<string> {
  const bundledRoot = app.isPackaged
    ? join(process.resourcesPath, 'quark-drive')
    : join(app.getAppPath(), 'vendor', 'quark-drive')

  return prepareUserQuarkRuntime(bundledRoot, join(persistentUserDataRoot, 'quark-drive'), {
    legacyRuntimeRoots: app.isPackaged ? [] : [bundledRoot]
  })
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1120,
    minHeight: 760,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0f0e25',
    title: '夸克分享链批量导出',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  if (!smokeMode) window.once('ready-to-show', () => window.show())
  if (smokeMode) {
    window.webContents.once('did-finish-load', async () => {
      try {
        const bridgeReady = await window.webContents.executeJavaScript(
          "Boolean(window.quarkApp && window.quarkApp.runtimeStatus && window.quarkApp.startWorkflow)"
        )
        app.exit(bridgeReady ? 0 : 2)
      } catch {
        app.exit(3)
      }
    })
  }
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    const current = window.webContents.getURL()
    if (url !== current) event.preventDefault()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return window
}

function registerIpc(quarkRuntimeRoot: string): void {
  const runner = new QuarkCliRunner(quarkRuntimeRoot)
  const activity = (message: string): void => {
    if (message.trim()) mainWindow?.webContents.send('quark:activity', message)
  }
  const quark = new QuarkService(runner, activity)
  const workflow = new WorkflowService(runner, quark, (event: WorkflowEvent) => {
    mainWindow?.webContents.send('workflow:event', event)
  })

  ipcMain.handle('runtime:status', () => quark.runtimeStatus())
  ipcMain.handle('account:info', () => quark.getAccountInfo())
  ipcMain.handle('account:login', (_event, token?: string) => quark.login(token))
  ipcMain.handle('local:pick', (_event, kind: 'files' | 'folder') => pickLocalEntries(kind))
  ipcMain.handle('output:pick', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择导出目录',
      buttonLabel: '使用此目录',
      properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled ? null : result.filePaths[0]
  })
  ipcMain.handle('cloud:scan', (_event, request: CloudScanRequest) => quark.scanCloud(request))
  ipcMain.handle('cloud:list', (_event, request: CloudListRequest) => quark.listCloudFolder(request))
  ipcMain.handle('workflow:start', (_event, request: WorkflowRequest) => ({
    jobId: workflow.start(request)
  }))
  ipcMain.handle('workflow:cancel', (_event, jobId: string) => workflow.cancel(jobId))
  ipcMain.handle('external:open', async (_event, url: string) => {
    if (!isSafeExternalUrl(url)) throw new Error('仅允许打开 HTTPS 链接')
    await shell.openExternal(url)
  })
  ipcMain.handle('file:reveal', (_event, path: string) => {
    if (typeof path !== 'string' || !path.trim()) throw new Error('无效的文件路径')
    shell.showItemInFolder(path)
  })
}

function isSafeExternalUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

void app.whenReady().then(async () => {
  app.setAppUserModelId('com.local.quarkshareexporter')
  registerIpc(await runtimeRoot())
  mainWindow = createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
  })
}).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : '未知错误'
  dialog.showErrorBox('夸克分享链批量导出启动失败', `无法准备官方 CLI 运行环境：${message}`)
  app.quit()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
