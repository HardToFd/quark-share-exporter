import { access, mkdir, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join } from 'node:path'
import ExcelJS from 'exceljs'
import type {
  ExportResult,
  ExportSettings,
  ShareExportRow,
  WorkflowRequest
} from '../../src/shared/types/desktop'
import { safeExportBaseName, summarizeRows } from './quarkData'

const columns = [
  ['批次ID', 'batchId'],
  ['状态', 'status'],
  ['来源', 'source'],
  ['本机原路径', 'sourcePath'],
  ['网盘路径', 'cloudPath'],
  ['相对路径', 'relativePath'],
  ['名称', 'name'],
  ['类型', 'kind'],
  ['深度', 'depth'],
  ['大小(Byte)', 'sizeBytes'],
  ['FID', 'fid'],
  ['分享粒度', 'shareScope'],
  ['可见性', 'visibility'],
  ['有效期', 'expiryLabel'],
  ['分享链接', 'shareUrl'],
  ['提取码', 'passcode'],
  ['创建时间', 'createdAt'],
  ['路径映射', 'mappingConfidence'],
  ['错误信息', 'error']
] as const

export async function exportRows(
  rows: ShareExportRow[],
  settings: ExportSettings,
  request: WorkflowRequest
): Promise<ExportResult> {
  await mkdir(settings.outputDirectory, { recursive: true })
  const baseName = safeExportBaseName(settings.fileName)
  const files: string[] = []

  if (settings.format === 'csv' || settings.format === 'both') {
    const path = await availablePath(settings.outputDirectory, baseName, '.csv')
    await writeFile(path, toCsv(rows), 'utf8')
    files.push(path)
  }

  if (settings.format === 'xlsx' || settings.format === 'both') {
    const path = await availablePath(settings.outputDirectory, baseName, '.xlsx')
    await writeWorkbook(path, rows, request)
    files.push(path)
  }

  const summary = summarizeRows(rows)
  return { files, rowCount: rows.length, ...summary }
}

export function toCsv(rows: ShareExportRow[]): string {
  const header = columns.map(([label]) => escapeCsv(label)).join(',')
  const body = rows.map((row) =>
    columns
      .map(([, key]) => escapeCsv(displayValue(row[key])))
      .join(',')
  )
  return `\uFEFF${[header, ...body].join('\r\n')}\r\n`
}

async function writeWorkbook(
  path: string,
  rows: ShareExportRow[],
  request: WorkflowRequest
): Promise<void> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = '夸克分享链批量导出'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet('分享链接', {
    views: [{ state: 'frozen', ySplit: 1 }]
  })
  sheet.columns = columns.map(([header, key]) => ({
    header,
    key,
    width: columnWidth(key)
  }))
  sheet.autoFilter = { from: 'A1', to: `S${Math.max(1, rows.length + 1)}` }

  for (const row of rows) {
    const excelRow = sheet.addRow(row)
    if (row.shareUrl) {
      const linkCell = excelRow.getCell('shareUrl')
      linkCell.value = { text: row.shareUrl, hyperlink: row.shareUrl }
      linkCell.font = { color: { argb: 'FF6558D9' }, underline: true }
    }
  }

  const header = sheet.getRow(1)
  header.height = 26
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF332E68' } }
  header.alignment = { vertical: 'middle', horizontal: 'center' }
  sheet.eachRow((row, index) => {
    if (index > 1) {
      row.alignment = { vertical: 'top', wrapText: false }
      if (index % 2 === 1) {
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F6FF' } }
      }
    }
  })

  const summary = workbook.addWorksheet('任务摘要')
  const counts = summarizeRows(rows)
  const summaryRows = [
    ['生成时间', new Date().toLocaleString('zh-CN')],
    ['来源', request.source.mode === 'local' ? '本机上传' : '夸克网盘目录'],
    ['总记录', rows.length],
    ['成功', counts.successCount],
    ['失败', counts.failedCount],
    ['分享方式', request.share.granularity === 'per-item' ? '逐项分享' : '合并分享'],
    ['链接类型', request.share.visibility === 'public' ? '公开链接' : '私密链接（服务端提取码）'],
    ['有效期类型', request.share.expiryType],
    ['最大递归深度', request.scope.maxDepth ?? '不限'],
    ['检索是否触顶', request.source.mode === 'cloud' && request.source.searchTruncated ? '是，可能不完整' : '否']
  ]
  summary.addRows(summaryRows)
  summary.getColumn(1).width = 22
  summary.getColumn(2).width = 48
  summary.getColumn(1).font = { bold: true, color: { argb: 'FF332E68' } }

  await workbook.xlsx.writeFile(path)
}

function displayValue(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (value === 'success') return '成功'
  if (value === 'failed') return '失败'
  if (value === 'skipped') return '已跳过'
  if (value === 'local') return '本机上传'
  if (value === 'cloud') return '网盘目录'
  if (value === 'file') return '文件'
  if (value === 'folder') return '文件夹'
  if (value === 'per-item') return '逐项分享'
  if (value === 'bundle') return '合并分享'
  if (value === 'public') return '公开'
  if (value === 'private') return '私密'
  if (value === 'exact') return '精确'
  if (value === 'ambiguous') return '同名同大小，按顺序匹配'
  if (value === 'unmatched') return '未匹配本机路径'
  return String(value)
}

function escapeCsv(value: string): string {
  const guarded = /^[=+\-@]/.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded
}

function columnWidth(key: (typeof columns)[number][1]): number {
  if (['sourcePath', 'cloudPath', 'relativePath', 'shareUrl', 'error'].includes(key)) return 44
  if (['batchId', 'fid'].includes(key)) return 24
  if (['name', 'createdAt'].includes(key)) return 22
  return 14
}

async function availablePath(directory: string, baseName: string, extension: string): Promise<string> {
  for (let suffix = 0; suffix < 10_000; suffix += 1) {
    const name = suffix === 0 ? `${baseName}${extension}` : `${baseName}-${suffix + 1}${extension}`
    const path = join(directory, name)
    try {
      await access(path, constants.F_OK)
    } catch {
      return path
    }
  }
  throw new Error('无法生成不重复的导出文件名')
}
