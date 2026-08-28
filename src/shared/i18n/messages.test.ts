import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LOCALE,
  normalizeLocale,
  translate,
  translateExternalMessage
} from './messages'

describe('interface translations', () => {
  it('defaults unknown or missing locale values to Simplified Chinese', () => {
    expect(DEFAULT_LOCALE).toBe('zh-CN')
    expect(normalizeLocale(undefined)).toBe('zh-CN')
    expect(normalizeLocale('fr')).toBe('zh-CN')
    expect(normalizeLocale('en')).toBe('en')
  })

  it('renders Chinese and English strings with variables', () => {
    expect(translate('zh-CN', 'run.summary', { count: 3, format: 'CSV' })).toBe('3 个项目 · CSV')
    expect(translate('en', 'run.summary', { count: 3, format: 'CSV' })).toBe('3 items · CSV')
    expect(translate('en', 'defaults.exportName', { date: '2026-08-28' })).toBe('Quark-Share-Links-2026-08-28')
    expect(translate('zh-CN', 'activity.failed')).toBe('失败')
    expect(translate('en', 'activity.cancelled')).toBe('Cancelled')
  })

  it('guides regular users to browse an upload folder without knowing a FID', () => {
    expect(translate('zh-CN', 'source.targetHint')).toContain('不需要知道 FID')
    expect(translate('zh-CN', 'browser.chooseUploadTarget')).toBe('选为上传位置')
    expect(translate('en', 'source.targetBrowse')).toBe('Choose a Drive folder')
    expect(translate('en', 'browser.selectedUploadTarget', { name: 'Deliverables' })).toBe('Upload destination: Deliverables')
  })

  it('translates exact and parameterized runtime messages for the English interface', () => {
    expect(translateExternalMessage('en', '正在检查授权状态…')).toBe('Checking authorization status…')
    expect(translateExternalMessage('en', '已添加 2 个本机文件')).toBe('Added 2 local files')
    expect(translateExternalMessage('en', '任务完成：成功 3 项，失败 1 项')).toBe('Task complete: 3 succeeded, 1 failed')
    expect(translateExternalMessage('en', '请选择上传目标目录：上传到网盘根目录，或从目录浏览器中选择文件夹'))
      .toBe('Choose an upload destination: the Drive root or a folder from the browser')
  })

  it('leaves source messages untouched in the Chinese interface', () => {
    expect(translateExternalMessage('zh-CN', '已添加 2 个本机文件')).toBe('已添加 2 个本机文件')
  })
})
