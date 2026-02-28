import { useMemo, useState } from 'react';
import type { TaskStatus } from '@vibecoding/shared';
import { useAppStore } from '../stores/app-store';
import TaskCard from './TaskCard';

interface TaskListProps {
  onOpenTaskForm: () => void;
}

type TabKey = 'waiting' | 'running' | 'awaiting' | 'completed' | 'failed' | 'cancelled';

const TABS: { key: TabKey; label: string; statuses: TaskStatus[] }[] = [
  { key: 'waiting', label: '待运行', statuses: ['PENDING', 'QUEUED'] },
  { key: 'running', label: '运行中', statuses: ['RUNNING'] },
  { key: 'awaiting', label: '待确认', statuses: ['AWAITING_INPUT'] },
  { key: 'completed', label: '已完成', statuses: ['COMPLETED'] },
  { key: 'failed', label: '失败', statuses: ['FAILED'] },
  { key: 'cancelled', label: '已取消', statuses: ['CANCELLED'] },
];

const TAB_COLORS: Record<TabKey, string> = {
  waiting: 'data-[active=true]:text-blue-400 data-[active=true]:border-blue-400',
  running: 'data-[active=true]:text-yellow-400 data-[active=true]:border-yellow-400',
  awaiting: 'data-[active=true]:text-purple-400 data-[active=true]:border-purple-400',
  completed: 'data-[active=true]:text-green-400 data-[active=true]:border-green-400',
  failed: 'data-[active=true]:text-red-400 data-[active=true]:border-red-400',
  cancelled: 'data-[active=true]:text-slate-500 data-[active=true]:border-slate-500',
};

export default function TaskList({ onOpenTaskForm }: TaskListProps) {
  const tasks = useAppStore((s) => s.tasks);
  const bulkDelete = useAppStore((s) => s.bulkDelete);
  const [activeTab, setActiveTab] = useState<TabKey>('waiting');

  const counts = useMemo(() => {
    const c: Record<TabKey, number> = { waiting: 0, running: 0, awaiting: 0, completed: 0, failed: 0, cancelled: 0 };
    for (const task of tasks) {
      for (const tab of TABS) {
        if (tab.statuses.includes(task.status)) {
          c[tab.key]++;
        }
      }
    }
    return c;
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    const tab = TABS.find((t) => t.key === activeTab);
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
    if (confirm(`确定清空所有${labels[status]}的任务？`)) {
      await bulkDelete(status);
    }
  };

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            data-active={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-transparent px-3 py-1.5 text-sm font-medium transition-colors text-slate-500 hover:text-slate-300 ${TAB_COLORS[tab.key]}`}
          >
            {tab.label}
            {counts[tab.key] > 0 && (
              <span className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-xs ${
                activeTab === tab.key ? 'bg-current/10' : 'bg-slate-800'
              }`}>
                {counts[tab.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Task list */}
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

      {/* Bulk actions */}
      {(counts.completed > 0 || counts.failed > 0 || counts.cancelled > 0) && (
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-800 pt-3">
          <span className="text-xs text-slate-500">批量操作:</span>
          {counts.completed > 0 && (
            <button
              onClick={() => handleBulkDelete('COMPLETED')}
              className="btn-ghost text-xs text-green-400/70 hover:text-green-400"
            >
              清空已完成 ({counts.completed})
            </button>
          )}
          {counts.failed > 0 && (
            <button
              onClick={() => handleBulkDelete('FAILED')}
              className="btn-ghost text-xs text-red-400/70 hover:text-red-400"
            >
              清空失败 ({counts.failed})
            </button>
          )}
          {counts.cancelled > 0 && (
            <button
              onClick={() => handleBulkDelete('CANCELLED')}
              className="btn-ghost text-xs text-slate-400/70 hover:text-slate-400"
            >
              清空已取消 ({counts.cancelled})
            </button>
          )}
        </div>
      )}
    </div>
  );
}
