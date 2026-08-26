export type ItemKind = 'file' | 'folder'
export type SourceMode = 'local' | 'cloud'
export type Visibility = 'public' | 'private'
export type ShareGranularity = 'per-item' | 'bundle'
export type ExportFormat = 'csv' | 'xlsx' | 'both'
export type ExpiryType = 1 | 2 | 3 | 4 | 5 | 6 | 7

export interface RuntimeStatus {
  available: boolean
  verified: boolean
  skillVersion: string
  cliVersion: string
  message: string
}

export interface AccountInfo {
  authenticated: boolean
  nickname?: string
  membership?: string
  usedBytes?: number
  totalBytes?: number
  message: string
}

export interface LocalEntry {
  path: string
  name: string
  kind: ItemKind
  size: number
  relativePath: string
  depth: number
}

export interface CloudEntry {
  fid: string
  name: string
  kind: ItemKind
  category?: number
  size: number
  parentFid?: string
  path: string
  fullPath: string
  relativePath: string
  depth: number
  updatedAt?: number
}

export interface LocalSelection {
  roots: string[]
  entries: LocalEntry[]
  skippedSymlinks: number
}

export interface CloudScanRequest {
  query: string
  pathPrefix?: string
}

export interface CloudScanResult {
  query: string
  total: number
  returned: number
  truncated: boolean
  items: CloudEntry[]
  folderCandidates: CloudEntry[]
  artifactAvailable: boolean
  checkAllLink?: string
  browseHint?: string
  message: string
}

export interface ScopeSettings {
  maxDepth: number | null
  includeRoot: boolean
  includeFiles: boolean
  includeFolders: boolean
}

export interface ShareSettings {
  granularity: ShareGranularity
  visibility: Visibility
  expiryType: ExpiryType
  titlePrefix: string
  bundleSize: number
  concurrency: number
  continueOnError: boolean
}

export interface ExportSettings {
  format: ExportFormat
  outputDirectory: string
  fileName: string
}

export type UploadTarget =
  | { mode: 'default' }
  | { mode: 'root' }
  | { mode: 'fid'; fid: string }

export type WorkflowSource =
  | {
      mode: 'local'
      roots: string[]
      localEntries: LocalEntry[]
      uploadTarget: UploadTarget
    }
  | {
      mode: 'cloud'
      query: string
      pathPrefix: string
      cloudItems: CloudEntry[]
      searchTotal: number
      searchTruncated: boolean
    }

export interface WorkflowRequest {
  source: WorkflowSource
  scope: ScopeSettings
  share: ShareSettings
  export: ExportSettings
}

export interface ShareExportRow {
  batchId: string
  status: 'success' | 'failed' | 'skipped'
  source: SourceMode
  sourcePath: string
  cloudPath: string
  relativePath: string
  name: string
  kind: ItemKind
  depth: number
  sizeBytes: number
  fid: string
  shareScope: ShareGranularity
  visibility: Visibility
  expiryLabel: string
  shareUrl: string
  passcode: string
  createdAt: string
  error: string
  mappingConfidence?: 'exact' | 'ambiguous' | 'unmatched'
}

export interface ExportResult {
  files: string[]
  rowCount: number
  successCount: number
  failedCount: number
}

export type WorkflowStage =
  | 'preflight'
  | 'upload'
  | 'select'
  | 'share'
  | 'export'
  | 'complete'
  | 'cancelled'

export interface WorkflowEvent {
  jobId: string
  type: 'stage' | 'progress' | 'log' | 'item' | 'complete' | 'error'
  stage: WorkflowStage
  message: string
  current?: number
  total?: number
  percent?: number
  row?: ShareExportRow
  result?: ExportResult
  level?: 'info' | 'success' | 'warning' | 'error'
  timestamp: string
}

export interface LoginResult {
  success: boolean
  needsManualCode: boolean
  authorizationUrl?: string
  message: string
}

export interface DesktopBridge {
  runtimeStatus(): Promise<RuntimeStatus>
  getAccountInfo(): Promise<AccountInfo>
  login(token?: string): Promise<LoginResult>
  pickLocalEntries(kind: 'files' | 'folder'): Promise<LocalSelection | null>
  pickOutputDirectory(): Promise<string | null>
  scanCloud(request: CloudScanRequest): Promise<CloudScanResult>
  startWorkflow(request: WorkflowRequest): Promise<{ jobId: string }>
  cancelWorkflow(jobId: string): Promise<boolean>
  openExternal(url: string): Promise<void>
  showItemInFolder(path: string): Promise<void>
  onWorkflowEvent(listener: (event: WorkflowEvent) => void): () => void
  onActivity(listener: (message: string) => void): () => void
}
