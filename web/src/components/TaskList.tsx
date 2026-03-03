import { useMemo, useState } from 'react';
import type { TaskStatus } from '@vibecoding/shared';
import { useAppStore } from '../stores/app-store';
import { useConfirm } from '../stores/confirm-store';
import { useT } from '../i18n';
import TaskCard from './TaskCard';

interface TaskListProps {
  onOpenTaskForm: () => void;
}

type TabKey = 'board' | 'waiting' | 'running' | 'awaiting' | 'completed' | 'failed' | 'cancelled';

type StatusTabKey = Exclude<TabKey, 'board'>;

const STATUS_TAB_STATUSES: Record<StatusTabKey, TaskStatus[]> = {
  waiting: ['PENDING', 'QUEUED'],
  running: ['RUNNING'],
  awaiting: ['AWAITING_INPUT'],
  completed: ['COMPLETED'],
  failed: ['FAILED'],
  cancelled: ['CANCELLED'],
};

const TAB_COLORS: Record<TabKey, string> = {
  board: 'data-[active=true]:text-brand-400 data-[active=true]:border-brand-400',
  waiting: 'data-[active=true]:text-blue-400 data-[active=true]:border-blue-400',
  running: 'data-[active=true]:text-yellow-400 data-[active=true]:border-yellow-400',
  awaiting: 'data-[active=true]:text-purple-400 data-[active=true]:border-purple-400',
  completed: 'data-[active=true]:text-green-400 data-[active=true]:border-green-400',
  failed: 'data-[active=true]:text-red-400 data-[active=true]:border-red-400',
  cancelled: 'data-[active=true]:text-ink-hint data-[active=true]:border-ink-hint',
};

const COLUMN_DOT_COLORS: Record<StatusTabKey, string> = {
  waiting: 'bg-blue-400',
  running: 'bg-yellow-400',
  awaiting: 'bg-purple-400',
  completed: 'bg-green-400',
  failed: 'bg-red-400',
  cancelled: 'bg-ink-hint',
};

const TERMINAL_TABS = new Set<StatusTabKey>(['completed', 'failed', 'cancelled']);

const TERMINAL_STATUS_MAP: Record<string, TaskStatus> = {
  completed: 'COMPLETED',
  failed: 'FAILED',
  cancelled: 'CANCELLED',
};

const STATUS_TAB_KEYS: StatusTabKey[] = ['waiting', 'running', 'awaiting', 'completed', 'failed', 'cancelled'];

export default function TaskList({ onOpenTaskForm }: TaskListProps) {
  const tasks = useAppStore((s) => s.tasks);
  const bulkDelete = useAppStore((s) => s.bulkDelete);
  const confirm = useConfirm();
  const t = useT();
  const [activeTab, setActiveTab] = useState<TabKey>('board');

  const TAB_LABELS: Record<TabKey, string> = {
    board: t.taskList.board,
    waiting: t.taskList.waiting,
    running: t.taskList.running,
    awaiting: t.taskList.awaiting,
    completed: t.taskList.completed,
    failed: t.taskList.failed,
    cancelled: t.taskList.cancelled,
  };

  const counts = useMemo(() => {
    const c: Record<StatusTabKey, number> = { waiting: 0, running: 0, awaiting: 0, completed: 0, failed: 0, cancelled: 0 };
    for (const task of tasks) {
      for (const key of STATUS_TAB_KEYS) {
        if (STATUS_TAB_STATUSES[key].includes(task.status)) {
          c[key]++;
        }
      }
    }
    return c;
  }, [tasks]);

  const tasksByColumn = useMemo(() => {
    const map: Record<StatusTabKey, typeof tasks> = {
      waiting: [], running: [], awaiting: [], completed: [], failed: [], cancelled: [],
    };
    for (const task of tasks) {
      for (const key of STATUS_TAB_KEYS) {
        if (STATUS_TAB_STATUSES[key].includes(task.status)) {
          map[key].push(task);
        }
      }
    }
    // Sort each column by creation time descending
    for (const key of STATUS_TAB_KEYS) {
      map[key].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return map;
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    if (activeTab === 'board') return [];
    const statuses = STATUS_TAB_STATUSES[activeTab as StatusTabKey];
    if (!statuses) return [];
    return tasks
      .filter((task) => statuses.includes(task.status))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [tasks, activeTab]);

  const handleBulkDelete = async (status: TaskStatus) => {
    const labels: Record<string, string> = {
      COMPLETED: t.taskList.completed,
      FAILED: t.taskList.failed,
      CANCELLED: t.taskList.cancelled,
    };
    if (await confirm(t.taskList.confirmClear(labels[status]))) {
      await bulkDelete(status);
    }
  };

  const isBoard = activeTab === 'board';

  const ALL_TAB_KEYS: TabKey[] = ['board', ...STATUS_TAB_KEYS];

  return (
    <div className={isBoard ? 'flex flex-col h-full' : 'space-y-4'}>
      {/* Tab bar */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none shrink-0">
        {ALL_TAB_KEYS.map((key) => (
          <button
            key={key}
            data-active={activeTab === key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-transparent px-3 py-1.5 text-sm font-medium transition-colors text-ink-hint hover:text-ink-3 ${TAB_COLORS[key]}`}
          >
            {TAB_LABELS[key]}
            {key !== 'board' && counts[key as StatusTabKey] > 0 && (
              <span className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-xs ${
                activeTab === key ? 'bg-current/10' : 'bg-th-elevated'
              }`}>
                {counts[key as StatusTabKey]}
              </span>
            )}
          </button>
        ))}
      </div>

      {isBoard ? (
        /* Board view */
        <div className="flex flex-col gap-4 overflow-y-auto flex-1 min-h-0 pt-2 md:flex-row md:gap-3 md:overflow-x-auto">
          {STATUS_TAB_KEYS.map((col) => (
            <div key={col} className="flex flex-col md:min-w-[230px] md:flex-1">
              {/* Column header */}
              <div className="flex items-center justify-between mb-2 px-1">
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${COLUMN_DOT_COLORS[col]}`} />
                  <span className="text-sm font-medium text-ink-3">{TAB_LABELS[col]}</span>
                  <span className="text-xs text-ink-hint">{counts[col]}</span>
                </div>
                {TERMINAL_TABS.has(col) && counts[col] > 0 && (
                  <button
                    onClick={() => handleBulkDelete(TERMINAL_STATUS_MAP[col])}
                    className="btn-ghost p-1 text-ink-faint hover:text-ink-muted"
                    title={t.taskList.clearColumn(TAB_LABELS[col])}
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                )}
              </div>
              {/* Column body */}
              <div className="space-y-2 rounded-lg bg-th-surface-dim p-2 md:flex-1 md:overflow-y-auto">
                {tasksByColumn[col].length === 0 ? (
                  <p className="text-xs text-ink-faint text-center py-4 md:py-6">{t.taskList.noTasks}</p>
                ) : (
                  tasksByColumn[col].map((task) => (
                    <TaskCard key={task.id} task={task} tinted />
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* List view */
        <>
          <div className="space-y-2">
            {filteredTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <svg className="h-12 w-12 text-ink-faint mb-3" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
                </svg>
                <p className="text-sm text-ink-hint">{t.taskList.noTasks}</p>
                {activeTab === 'waiting' && (
                  <button onClick={onOpenTaskForm} className="btn-primary mt-3 text-sm">
                    {t.taskList.createFirst}
                  </button>
                )}
              </div>
            ) : (
              filteredTasks.map((task) => <TaskCard key={task.id} task={task} tinted />)
            )}
          </div>

          {/* Bulk actions - only show in corresponding tab */}
          {activeTab === 'completed' && counts.completed > 0 && (
            <div className="flex items-center gap-2 border-t border-th-border pt-3">
              <button
                onClick={() => handleBulkDelete('COMPLETED')}
                className="btn-ghost text-xs text-green-400/70 hover:text-green-400"
              >
                {t.taskList.clearCompleted(counts.completed)}
              </button>
            </div>
          )}
          {activeTab === 'failed' && counts.failed > 0 && (
            <div className="flex items-center gap-2 border-t border-th-border pt-3">
              <button
                onClick={() => handleBulkDelete('FAILED')}
                className="btn-ghost text-xs text-red-400/70 hover:text-red-400"
              >
                {t.taskList.clearFailed(counts.failed)}
              </button>
            </div>
          )}
          {activeTab === 'cancelled' && counts.cancelled > 0 && (
            <div className="flex items-center gap-2 border-t border-th-border pt-3">
              <button
                onClick={() => handleBulkDelete('CANCELLED')}
                className="btn-ghost text-xs text-ink-muted/70 hover:text-ink-muted"
              >
                {t.taskList.clearCancelled(counts.cancelled)}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
