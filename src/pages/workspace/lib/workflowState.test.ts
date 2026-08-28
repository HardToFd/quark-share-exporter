import { describe, expect, it } from 'vitest'
import type { WorkflowEvent } from '../../../shared/types/desktop'
import { workflowStateAfterEvent, type WorkspaceWorkflowState } from './workflowState'

describe('workflowStateAfterEvent', () => {
  it('replaces the stale export progress with a completed 100% state', () => {
    const current = runningState('export', 0, '正在生成 CSV/Excel')

    const next = workflowStateAfterEvent(current, event({
      type: 'complete',
      stage: 'complete',
      message: '任务完成：成功 1 项，失败 0 项'
    }))

    expect(next).toEqual({
      status: 'completed',
      progress: {
        stage: 'complete',
        percent: 100,
        message: '任务完成：成功 1 项，失败 0 项'
      }
    })
  })

  it('marks cancellation as terminal without pretending the task reached 100%', () => {
    const current = runningState('share', 60, '已处理 3 / 5')

    const next = workflowStateAfterEvent(current, event({
      type: 'complete',
      stage: 'cancelled',
      message: '任务已取消'
    }))

    expect(next.status).toBe('cancelled')
    expect(next.progress).toEqual({ stage: 'cancelled', percent: 60, message: '任务已取消' })
  })

  it('maps error events to an explicit failed stage and keeps the last known progress', () => {
    const current = runningState('upload', 40, '已上传 2 / 5 个文件')

    const next = workflowStateAfterEvent(current, event({
      type: 'error',
      stage: 'complete',
      message: '上传失败'
    }))

    expect(next.status).toBe('failed')
    expect(next.progress).toEqual({ stage: 'failed', percent: 40, message: '上传失败' })
  })
})

function runningState(
  stage: WorkspaceWorkflowState['progress']['stage'],
  percent: number,
  message: string
): WorkspaceWorkflowState {
  return { status: 'running', progress: { stage, percent, message } }
}

function event(overrides: Pick<WorkflowEvent, 'type' | 'stage' | 'message'>): WorkflowEvent {
  return {
    jobId: 'job-test',
    timestamp: '2026-08-28T00:00:00.000Z',
    ...overrides
  }
}
