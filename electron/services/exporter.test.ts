import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { exportRows, toCsv } from './exporter'
import type { ShareExportRow, WorkflowRequest } from '../../src/shared/types/desktop'

describe('exporters', () => {
  it('adds a BOM, escapes commas and guards spreadsheet formulas', () => {
    const csv = toCsv([sampleRow()])
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain("'=cmd|test")
    expect(csv).toContain('"夸克网盘/资料,a.pdf"')
  })

  it('writes a readable workbook with summary and hyperlink sheets', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'quark-export-test-'))
    try {
      const request: WorkflowRequest = {
        source: {
          mode: 'cloud',
          query: '资料',
          pathPrefix: '夸克网盘/资料',
          cloudItems: [],
          searchTotal: 1,
          searchTruncated: false
        },
        scope: { maxDepth: null, includeRoot: false, includeFiles: true, includeFolders: false },
        share: {
          granularity: 'per-item',
          visibility: 'private',
          expiryType: 1,
          titlePrefix: '',
          bundleSize: 100,
          concurrency: 1,
          continueOnError: true
        },
        export: { format: 'xlsx', outputDirectory: directory, fileName: 'links' }
      }
      const result = await exportRows([sampleRow()], request.export, request)
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.readFile(result.files[0])
      expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['分享链接', '任务摘要'])
      expect(workbook.getWorksheet('分享链接')?.rowCount).toBe(2)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})

function sampleRow(): ShareExportRow {
  return {
    batchId: 'b1',
    status: 'success',
    source: 'local',
    sourcePath: '=cmd|test',
    cloudPath: '夸克网盘/资料,a.pdf',
    relativePath: '资料/a.pdf',
    name: 'a.pdf',
    kind: 'file',
    depth: 1,
    sizeBytes: 10,
    fid: 'fid',
    shareScope: 'per-item',
    visibility: 'private',
    expiryLabel: '永久有效',
    shareUrl: 'https://pan.quark.cn/s/test',
    passcode: 'abcd',
    createdAt: '2026-08-26T00:00:00.000Z',
    error: ''
  }
}
