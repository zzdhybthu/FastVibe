import { useEffect } from 'react';
import { useAppStore } from '../stores/app-store';
import { StatusBadge, isTerminalStatus } from '../lib/status';
import LogViewer from './LogViewer';
import UserConfirm from './UserConfirm';

interface TaskDetailProps {
  onClose: () => void;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDuration(start: string | null, end: string | null): string {
  if (!start) return '-';
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const diff = Math.floor((e - s) / 1000);

  if (diff < 60) return `${diff}秒`;
  if (diff < 3600) return `${Math.floor(diff / 60)}分${diff % 60}秒`;
  return `${Math.floor(diff / 3600)}时${Math.floor((diff % 3600) / 60)}分`;
}

export default function TaskDetail({ onClose }: TaskDetailProps) {
  const selectedTaskId = useAppStore((s) => s.selectedTaskId);
  const taskDetail = useAppStore((s) => s.taskDetail);
  const fetchTaskDetail = useAppStore((s) => s.fetchTaskDetail);

  useEffect(() => {
    if (selectedTaskId) {
      fetchTaskDetail(selectedTaskId);
    }
  }, [selectedTaskId, fetchTaskDetail]);

  if (!taskDetail || taskDetail.id !== selectedTaskId) {
    return null;
  }

  const pendingInteractions = taskDetail.interactions.filter((i) => i.status === 'pending');

  return (
    <div className="card space-y-4 overflow-y-auto max-h-[calc(100vh-6rem)]">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <StatusBadge status={taskDetail.status} />
            {taskDetail.thinkingEnabled && (
              <span className="badge border border-brand-400/20 bg-brand-400/10 text-brand-400">
                思考模式
              </span>
            )}
          </div>
          <h2 className="text-lg font-semibold text-ink">
            {taskDetail.title || '未命名任务'}
          </h2>
        </div>
        <button onClick={onClose} className="btn-ghost p-1.5 shrink-0">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Prompt */}
      <div>
        <h3 className="text-xs font-medium text-ink-hint uppercase tracking-wider mb-1">提示词</h3>
        <div className="rounded-lg bg-th-input border border-th-border-strong p-3 text-sm text-ink-3 whitespace-pre-wrap font-mono">
          {taskDetail.prompt}
        </div>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className="text-xs text-ink-hint">创建时间</span>
          <p className="text-sm text-ink-3">{formatDateTime(taskDetail.createdAt)}</p>
        </div>
        <div>
          <span className="text-xs text-ink-hint">开始时间</span>
          <p className="text-sm text-ink-3">{formatDateTime(taskDetail.startedAt)}</p>
        </div>
        <div>
          <span className="text-xs text-ink-hint">耗时</span>
          <p className="text-sm text-ink-3">{formatDuration(taskDetail.startedAt, taskDetail.completedAt)}</p>
        </div>
        <div>
          <span className="text-xs text-ink-hint">费用</span>
          <p className="text-sm text-ink-3">
            {taskDetail.costUsd != null ? `$${taskDetail.costUsd.toFixed(4)}` : '-'}
          </p>
        </div>
        {taskDetail.branchName && (
          <div className="col-span-2">
            <span className="text-xs text-ink-hint">分支</span>
            <p className="text-sm text-ink-3 font-mono">{taskDetail.branchName}</p>
          </div>
        )}
      </div>

      {/* Error */}
      {taskDetail.errorMessage && (
        <div>
          <h3 className="text-xs font-medium text-red-400 uppercase tracking-wider mb-1">错误信息</h3>
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-300 font-mono whitespace-pre-wrap">
            {taskDetail.errorMessage}
          </div>
        </div>
      )}

      {/* Result */}
      {taskDetail.result && (
        <div>
          <h3 className="text-xs font-medium text-green-400 uppercase tracking-wider mb-1">执行结果</h3>
          <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-3 text-sm text-green-300 font-mono whitespace-pre-wrap max-h-[200px] overflow-y-auto">
            {taskDetail.result}
          </div>
        </div>
      )}

      {/* Pending interactions — hide when task is in terminal status */}
      {pendingInteractions.length > 0 && !isTerminalStatus(taskDetail.status) && (
        <div>
          <h3 className="text-xs font-medium text-purple-400 uppercase tracking-wider mb-2">等待确认</h3>
          {pendingInteractions.map((interaction) => (
            <UserConfirm key={interaction.id} interaction={interaction} />
          ))}
        </div>
      )}

      {/* Logs */}
      <div>
        <h3 className="text-xs font-medium text-ink-hint uppercase tracking-wider mb-2">
          日志 ({taskDetail.logs.length})
        </h3>
        <LogViewer logs={taskDetail.logs} />
      </div>

      {/* Past interactions */}
      {taskDetail.interactions.filter((i) => i.status !== 'pending').length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-ink-hint uppercase tracking-wider mb-2">历史交互</h3>
          <div className="space-y-2">
            {taskDetail.interactions
              .filter((i) => i.status !== 'pending')
              .map((interaction) => {
                let question = '';
                try {
                  const parsed = JSON.parse(interaction.questionData);
                  question = typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2);
                } catch {
                  question = interaction.questionData;
                }

                let answer = '';
                if (interaction.answerData) {
                  try {
                    const parsed = JSON.parse(interaction.answerData);
                    answer = typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2);
                  } catch {
                    answer = interaction.answerData;
                  }
                }

                return (
                  <div key={interaction.id} className="rounded-lg bg-th-input border border-th-border p-3 space-y-2">
                    <div>
                      <span className="text-xs text-purple-400 font-medium">问题</span>
                      <p className="text-sm text-ink-3 mt-0.5">{question}</p>
                    </div>
                    {answer && (
                      <div>
                        <span className="text-xs text-green-400 font-medium">回答</span>
                        <p className="text-sm text-ink-3 mt-0.5">{answer}</p>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-xs text-ink-faint">
                      <span>{interaction.status === 'answered' ? '已回答' : '已超时'}</span>
                      {interaction.answeredAt && (
                        <span>{formatDateTime(interaction.answeredAt)}</span>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
