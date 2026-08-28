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
  })

  it('translates exact and parameterized runtime messages for the English interface', () => {
    expect(translateExternalMessage('en', '正在检查授权状态…')).toBe('Checking authorization status…')
    expect(translateExternalMessage('en', '已添加 2 个本机文件')).toBe('Added 2 local files')
    expect(translateExternalMessage('en', '任务完成：成功 3 项，失败 1 项')).toBe('Task complete: 3 succeeded, 1 failed')
  })

  it('leaves source messages untouched in the Chinese interface', () => {
    expect(translateExternalMessage('zh-CN', '已添加 2 个本机文件')).toBe('已添加 2 个本机文件')
  })
})
