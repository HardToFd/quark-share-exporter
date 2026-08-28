import type { WorkflowEvent, WorkflowStage } from '../../../shared/types/desktop'

export type WorkflowRunStatus = 'idle' | 'running' | 'completed' | 'cancelled' | 'failed'
export type WorkspaceWorkflowStage = WorkflowStage | 'failed'

export interface WorkspaceWorkflowState {
  status: WorkflowRunStatus
  progress: {
    stage: WorkspaceWorkflowStage
    percent: number
    message: string
  }
}

export const initialWorkflowState: WorkspaceWorkflowState = {
  status: 'idle',
  progress: { stage: 'preflight', percent: 0, message: '等待开始' }
}

export function workflowStateAfterEvent(
  current: WorkspaceWorkflowState,
  event: WorkflowEvent
): WorkspaceWorkflowState {
  if (event.type === 'progress' || event.type === 'stage') {
    return {
      ...current,
      progress: {
        stage: event.stage,
        percent: normalizedPercent(
          event.percent ?? (event.stage === 'cancelled' ? current.progress.percent : 0)
        ),
        message: event.message
      }
    }
  }

  if (event.type === 'complete') {
    const cancelled = event.stage === 'cancelled'
    return {
      status: cancelled ? 'cancelled' : 'completed',
      progress: {
        stage: cancelled ? 'cancelled' : 'complete',
        percent: cancelled
          ? normalizedPercent(event.percent ?? current.progress.percent)
          : 100,
        message: event.message
      }
    }
  }

  if (event.type === 'error') {
    const cancelled = event.stage === 'cancelled'
    return {
      status: cancelled ? 'cancelled' : 'failed',
      progress: {
        stage: cancelled ? 'cancelled' : 'failed',
        percent: normalizedPercent(event.percent ?? current.progress.percent),
        message: event.message
      }
    }
  }

  return current
}

function normalizedPercent(percent: number): number {
  return Math.max(0, Math.min(100, percent))
}
