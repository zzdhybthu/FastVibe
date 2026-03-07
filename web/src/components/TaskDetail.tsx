import { useEffect, useMemo, useState } from 'react';
import type { LogLevel } from '@fastvibe/shared';
import { useAppStore } from '../stores/app-store';
import { useLanguageStore } from '../stores/language-store';
import { StatusBadge, isTerminalStatus } from '../lib/status';
import { useT } from '../i18n';
import LogViewer from './LogViewer';
import UserConfirm from './UserConfirm';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="absolute top-2 right-2 p-1 rounded text-ink-hint hover:text-ink-2 hover:bg-th-hover transition-colors"
    >
      {copied ? (
        <svg className="h-4 w-4 text-green-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      ) : (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
        </svg>
      )}
    </button>
  );
}

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

export default function TaskDetail({ onClose }: TaskDetailProps) {
  const selectedTaskId = useAppStore((s) => s.selectedTaskId);
  const taskDetail = useAppStore((s) => s.taskDetail);
  const tasks = useAppStore((s) => s.tasks);
  const fetchTaskDetail = useAppStore((s) => s.fetchTaskDetail);
  const t = useT();
  const logLevel = useLanguageStore((s) => s.logLevel);
  const [showConfig, setShowConfig] = useState(false);

  const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
  const filteredLogCount = useMemo(() => {
    if (!taskDetail) return 0;
    const minPriority = LOG_LEVEL_PRIORITY[logLevel];
    return taskDetail.logs.filter((log) => (LOG_LEVEL_PRIORITY[log.level] ?? 0) >= minPriority).length;
  }, [taskDetail?.logs, logLevel]);

  useEffect(() => {
    if (selectedTaskId) {
      fetchTaskDetail(selectedTaskId);
    }
  }, [selectedTaskId, fetchTaskDetail]);

  if (!taskDetail || taskDetail.id !== selectedTaskId) {
    return null;
  }

  const pendingInteractions = taskDetail.interactions.filter((i) => i.status === 'pending');

  const formatDuration = (start: string | null, end: string | null): string => {
    if (!start) return '-';
    const s = new Date(start).getTime();
    const e = end ? new Date(end).getTime() : Date.now();
    const diff = Math.floor((e - s) / 1000);

    if (diff < 60) return `${diff}${t.taskDetail.seconds}`;
    if (diff < 3600) return `${Math.floor(diff / 60)}${t.taskDetail.minutes}${diff % 60}${t.taskDetail.seconds}`;
    return `${Math.floor(diff / 3600)}${t.taskDetail.hours}${Math.floor((diff % 3600) / 60)}${t.taskDetail.minutes}`;
  };

  return (
    <div className="card space-y-4 overflow-y-auto max-h-[calc(100vh-6rem)]">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <StatusBadge status={taskDetail.status} />
            <span className="badge border border-th-border-strong bg-th-elevated text-ink-hint">
              {taskDetail.agentType === 'codex' ? 'Codex' : 'Claude Code'}
            </span>
            {taskDetail.thinkingEnabled && (
              <span className="badge border border-brand-400/20 bg-brand-400/10 text-brand-400">
                {t.taskDetail.thinkingMode}
              </span>
            )}
          </div>
          <h2 className="text-lg font-semibold text-ink">
            {taskDetail.title || t.taskDetail.untitled}
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
        <h3 className="text-xs font-medium text-ink-hint uppercase tracking-wider mb-1">{t.taskDetail.prompt}</h3>
        <div className="relative rounded-lg bg-th-input border border-th-border-strong p-3 pr-9 text-sm text-ink-3 whitespace-pre-wrap font-mono">
          <CopyButton text={taskDetail.prompt} />
          {taskDetail.prompt}
        </div>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className="text-xs text-ink-hint">{t.taskDetail.createdAt}</span>
          <p className="text-sm text-ink-3">{formatDateTime(taskDetail.createdAt)}</p>
        </div>
        <div>
          <span className="text-xs text-ink-hint">{t.taskDetail.startedAt}</span>
          <p className="text-sm text-ink-3">{formatDateTime(taskDetail.startedAt)}</p>
        </div>
        <div>
          <span className="text-xs text-ink-hint">{t.taskDetail.duration}</span>
          <p className="text-sm text-ink-3">{formatDuration(taskDetail.startedAt, taskDetail.completedAt)}</p>
        </div>
        <div>
          <span className="text-xs text-ink-hint">{t.taskDetail.cost}</span>
          <p className="text-sm text-ink-3">
            {taskDetail.costUsd != null ? `$${taskDetail.costUsd.toFixed(4)}` : '-'}
          </p>
        </div>
        {taskDetail.branchName && (
          <div className="col-span-2">
            <span className="text-xs text-ink-hint">{t.taskDetail.branch}</span>
            <p className="text-sm text-ink-3 font-mono">{taskDetail.branchName}</p>
          </div>
        )}
      </div>

      {/* Task Configuration (collapsible) */}
      <div>
        <button
          type="button"
          onClick={() => setShowConfig(!showConfig)}
          className="flex items-center gap-1.5 text-xs font-medium text-ink-hint uppercase tracking-wider hover:text-ink-3 transition-colors"
        >
          <svg
            className={`h-3.5 w-3.5 transition-transform ${showConfig ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
          {t.taskDetail.config}
        </button>
        {showConfig && (
          <div className="mt-2 grid grid-cols-2 gap-3 rounded-lg bg-th-input border border-th-border-strong p-3">
            <div>
              <span className="text-xs text-ink-hint">{t.taskDetail.configAgent}</span>
              <p className="text-sm text-ink-3 font-mono">{taskDetail.agentType === 'codex' ? 'Codex' : 'Claude Code'}</p>
            </div>
            <div>
              <span className="text-xs text-ink-hint">{t.taskDetail.configModel}</span>
              <p className="text-sm text-ink-3 font-mono">{taskDetail.model}</p>
            </div>
            <div>
              <span className="text-xs text-ink-hint">{t.taskDetail.configBudget}</span>
              <p className="text-sm text-ink-3">${taskDetail.maxBudgetUsd}</p>
            </div>
            <div>
              <span className="text-xs text-ink-hint">{t.taskDetail.configTimeout}</span>
              <p className="text-sm text-ink-3">{taskDetail.interactionTimeout}{t.taskDetail.configSeconds}</p>
            </div>
            <div>
              <span className="text-xs text-ink-hint">{t.taskDetail.configLanguage}</span>
              <p className="text-sm text-ink-3">{taskDetail.language === 'en' ? 'English' : '中文'}</p>
            </div>
            <div>
              <span className="text-xs text-ink-hint">{t.taskDetail.configThinking}</span>
              <p className="text-sm text-ink-3">
                {taskDetail.thinkingEnabled ? t.taskDetail.configEnabled : t.taskDetail.configDisabled}
              </p>
            </div>
            <div>
              <span className="text-xs text-ink-hint">{t.taskDetail.configPredecessor}</span>
              <p className="text-sm text-ink-3 truncate">
                {taskDetail.predecessorTaskId
                  ? (() => {
                      const pred = tasks.find((tk) => tk.id === taskDetail.predecessorTaskId);
                      return pred
                        ? (pred.title || pred.prompt.slice(0, 60))
                        : taskDetail.predecessorTaskId.slice(0, 8);
                    })()
                  : t.taskDetail.configNone}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {taskDetail.errorMessage && (
        <div>
          <h3 className="text-xs font-medium text-red-400 uppercase tracking-wider mb-1">{t.taskDetail.errorMessage}</h3>
          <div className="relative rounded-lg bg-red-500/10 border border-red-500/20 p-3 pr-9 text-sm text-red-300 font-mono whitespace-pre-wrap">
            <CopyButton text={taskDetail.errorMessage} />
            {taskDetail.errorMessage}
          </div>
        </div>
      )}

      {/* Result */}
      {taskDetail.result && (
        <div>
          <h3 className="text-xs font-medium text-green-400 uppercase tracking-wider mb-1">{t.taskDetail.result}</h3>
          <div className="relative rounded-lg bg-green-500/10 border border-green-500/20 p-3 pr-9 text-sm text-green-300 font-mono whitespace-pre-wrap max-h-[200px] overflow-y-auto">
            <CopyButton text={taskDetail.result} />
            {taskDetail.result}
          </div>
        </div>
      )}

      {/* Pending interactions — hide when task is in terminal status */}
      {pendingInteractions.length > 0 && !isTerminalStatus(taskDetail.status) && (
        <div>
          <h3 className="text-xs font-medium text-purple-400 uppercase tracking-wider mb-2">{t.taskDetail.awaitingConfirm}</h3>
          {pendingInteractions.map((interaction) => (
            <UserConfirm key={interaction.id} interaction={interaction} />
          ))}
        </div>
      )}

      {/* Logs */}
      <div>
        <h3 className="text-xs font-medium text-ink-hint uppercase tracking-wider mb-2">
          {t.taskDetail.logs} ({filteredLogCount})
        </h3>
        <LogViewer logs={taskDetail.logs} />
      </div>

      {/* Past interactions */}
      {taskDetail.interactions.filter((i) => i.status !== 'pending').length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-ink-hint uppercase tracking-wider mb-2">{t.taskDetail.pastInteractions}</h3>
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
                      <span className="text-xs text-purple-400 font-medium">{t.taskDetail.question}</span>
                      <p className="text-sm text-ink-3 mt-0.5">{question}</p>
                    </div>
                    {answer && (
                      <div>
                        <span className="text-xs text-green-400 font-medium">{t.taskDetail.answer}</span>
                        <p className="text-sm text-ink-3 mt-0.5">{answer}</p>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-xs text-ink-faint">
                      <span>{interaction.status === 'answered' ? t.taskDetail.answered : t.taskDetail.timedOut}</span>
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
