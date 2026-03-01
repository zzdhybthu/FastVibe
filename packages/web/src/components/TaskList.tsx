import { useMemo, useState } from 'react';
import type { TaskStatus } from '@vibecoding/shared';
import { useAppStore } from '../stores/app-store';
import { useConfirm } from '../stores/confirm-store';
import TaskCard from './TaskCard';

interface TaskListProps {
  onOpenTaskForm: () => void;
}

type TabKey = 'board' | 'waiting' | 'running' | 'awaiting' | 'completed' | 'failed' | 'cancelled';

type StatusTabKey = Exclude<TabKey, 'board'>;

const STATUS_TABS: { key: StatusTabKey; label: string; statuses: TaskStatus[] }[] = [
  { key: 'waiting', label: '待运行', statuses: ['PENDING', 'QUEUED'] },
  { key: 'running', label: '运行中', statuses: ['RUNNING'] },
  { key: 'awaiting', label: '待确认', statuses: ['AWAITING_INPUT'] },
  { key: 'completed', label: '已完成', statuses: ['COMPLETED'] },
  { key: 'failed', label: '失败', statuses: ['FAILED'] },
  { key: 'cancelled', label: '已取消', statuses: ['CANCELLED'] },
];

const TABS: { key: TabKey; label: string; statuses: TaskStatus[] }[] = [
  { key: 'board', label: '看板', statuses: [] },
  ...STATUS_TABS,
];

const TAB_COLORS: Record<TabKey, string> = {
  board: 'data-[active=true]:text-brand-400 data-[active=true]:border-brand-400',
  waiting: 'data-[active=true]:text-blue-400 data-[active=true]:border-blue-400',
  running: 'data-[active=true]:text-yellow-400 data-[active=true]:border-yellow-400',
  awaiting: 'data-[active=true]:text-purple-400 data-[active=true]:border-purple-400',
  completed: 'data-[active=true]:text-green-400 data-[active=true]:border-green-400',
  failed: 'data-[active=true]:text-red-400 data-[active=true]:border-red-400',
  cancelled: 'data-[active=true]:text-slate-500 data-[active=true]:border-slate-500',
};

const COLUMN_DOT_COLORS: Record<StatusTabKey, string> = {
  waiting: 'bg-blue-400',
  running: 'bg-yellow-400',
  awaiting: 'bg-purple-400',
  completed: 'bg-green-400',
  failed: 'bg-red-400',
  cancelled: 'bg-slate-500',
};

const TERMINAL_TABS = new Set<StatusTabKey>(['completed', 'failed', 'cancelled']);

const TERMINAL_STATUS_MAP: Record<string, TaskStatus> = {
  completed: 'COMPLETED',
  failed: 'FAILED',
  cancelled: 'CANCELLED',
};

export default function TaskList({ onOpenTaskForm }: TaskListProps) {
  const tasks = useAppStore((s) => s.tasks);
  const bulkDelete = useAppStore((s) => s.bulkDelete);
  const confirm = useConfirm();
  const [activeTab, setActiveTab] = useState<TabKey>('board');

  const counts = useMemo(() => {
    const c: Record<StatusTabKey, number> = { waiting: 0, running: 0, awaiting: 0, completed: 0, failed: 0, cancelled: 0 };
    for (const task of tasks) {
      for (const tab of STATUS_TABS) {
        if (tab.statuses.includes(task.status)) {
          c[tab.key]++;
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
      for (const tab of STATUS_TABS) {
        if (tab.statuses.includes(task.status)) {
          map[tab.key].push(task);
        }
      }
    }
    // Sort each column by creation time descending
    for (const key of Object.keys(map) as StatusTabKey[]) {
      map[key].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return map;
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    if (activeTab === 'board') return [];
    const tab = STATUS_TABS.find((t) => t.key === activeTab);
    if (!tab) return [];
    return tasks
      .filter((t) => tab.statuses.includes(t.status))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [tasks, activeTab]);

  const handleBulkDelete = async (status: TaskStatus) => {
    const labels: Record<string, string> = {
      COMPLETED: '已完成',
      FAILED: '失败',
      CANCELLED: '已取消',
    };
    if (await confirm(`确定清空所有${labels[status]}的任务？`)) {
      await bulkDelete(status);
    }
  };

  const isBoard = activeTab === 'board';

  return (
    <div className={isBoard ? 'flex flex-col h-full' : 'space-y-4'}>
      {/* Tab bar */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            data-active={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-transparent px-3 py-1.5 text-sm font-medium transition-colors text-slate-500 hover:text-slate-300 ${TAB_COLORS[tab.key]}`}
          >
            {tab.label}
            {tab.key !== 'board' && counts[tab.key as StatusTabKey] > 0 && (
              <span className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-xs ${
                activeTab === tab.key ? 'bg-current/10' : 'bg-slate-800'
              }`}>
                {counts[tab.key as StatusTabKey]}
              </span>
            )}
          </button>
        ))}
      </div>

      {isBoard ? (
        /* Board view */
        <div className="flex gap-3 overflow-x-auto flex-1 min-h-0 pt-2">
          {STATUS_TABS.map((col) => (
            <div key={col.key} className="min-w-[220px] flex-1 flex flex-col">
              {/* Column header */}
              <div className="flex items-center justify-between mb-2 px-1">
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${COLUMN_DOT_COLORS[col.key]}`} />
                  <span className="text-sm font-medium text-slate-300">{col.label}</span>
                  <span className="text-xs text-slate-500">{counts[col.key]}</span>
                </div>
                {TERMINAL_TABS.has(col.key) && counts[col.key] > 0 && (
                  <button
                    onClick={() => handleBulkDelete(TERMINAL_STATUS_MAP[col.key])}
                    className="btn-ghost p-1 text-slate-600 hover:text-slate-400"
                    title={`清空${col.label}`}
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                )}
              </div>
              {/* Column body */}
              <div className="flex-1 overflow-y-auto space-y-2 rounded-lg bg-slate-900/40 p-2">
                {tasksByColumn[col.key].length === 0 ? (
                  <p className="text-xs text-slate-600 text-center py-6">暂无任务</p>
                ) : (
                  tasksByColumn[col.key].map((task) => (
                    <TaskCard key={task.id} task={task} />
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
                <svg className="h-12 w-12 text-slate-700 mb-3" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
                </svg>
                <p className="text-sm text-slate-500">暂无任务</p>
                {activeTab === 'waiting' && (
                  <button onClick={onOpenTaskForm} className="btn-primary mt-3 text-sm">
                    创建第一个任务
                  </button>
                )}
              </div>
            ) : (
              filteredTasks.map((task) => <TaskCard key={task.id} task={task} />)
            )}
          </div>

          {/* Bulk actions - only show in corresponding tab */}
          {activeTab === 'completed' && counts.completed > 0 && (
            <div className="flex items-center gap-2 border-t border-slate-800 pt-3">
              <button
                onClick={() => handleBulkDelete('COMPLETED')}
                className="btn-ghost text-xs text-green-400/70 hover:text-green-400"
              >
                清空已完成 ({counts.completed})
              </button>
            </div>
          )}
          {activeTab === 'failed' && counts.failed > 0 && (
            <div className="flex items-center gap-2 border-t border-slate-800 pt-3">
              <button
                onClick={() => handleBulkDelete('FAILED')}
                className="btn-ghost text-xs text-red-400/70 hover:text-red-400"
              >
                清空失败 ({counts.failed})
              </button>
            </div>
          )}
          {activeTab === 'cancelled' && counts.cancelled > 0 && (
            <div className="flex items-center gap-2 border-t border-slate-800 pt-3">
              <button
                onClick={() => handleBulkDelete('CANCELLED')}
                className="btn-ghost text-xs text-slate-400/70 hover:text-slate-400"
              >
                清空已取消 ({counts.cancelled})
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
