import { contextBridge, ipcRenderer } from 'electron'
import type {
  CloudScanRequest,
  DesktopBridge,
  WorkflowEvent,
  WorkflowRequest
} from '../../src/shared/types/desktop'

const bridge: DesktopBridge = {
  runtimeStatus: () => ipcRenderer.invoke('runtime:status'),
  getAccountInfo: () => ipcRenderer.invoke('account:info'),
  login: (token?: string) => ipcRenderer.invoke('account:login', token),
  pickLocalEntries: (kind) => ipcRenderer.invoke('local:pick', kind),
  pickOutputDirectory: () => ipcRenderer.invoke('output:pick'),
  scanCloud: (request: CloudScanRequest) => ipcRenderer.invoke('cloud:scan', request),
  startWorkflow: (request: WorkflowRequest) => ipcRenderer.invoke('workflow:start', request),
  cancelWorkflow: (jobId: string) => ipcRenderer.invoke('workflow:cancel', jobId),
  openExternal: (url: string) => ipcRenderer.invoke('external:open', url),
  showItemInFolder: (path: string) => ipcRenderer.invoke('file:reveal', path),
  onWorkflowEvent: (listener: (event: WorkflowEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, value: WorkflowEvent): void => listener(value)
    ipcRenderer.on('workflow:event', handler)
    return () => ipcRenderer.removeListener('workflow:event', handler)
  },
  onActivity: (listener: (message: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, value: string): void => listener(value)
    ipcRenderer.on('quark:activity', handler)
    return () => ipcRenderer.removeListener('quark:activity', handler)
  }
}

contextBridge.exposeInMainWorld('quarkApp', bridge)
