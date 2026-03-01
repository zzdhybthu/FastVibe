import type { Task } from '@vibecoding/shared';
import { useAppStore } from '../stores/app-store';
import { StatusBadge, isTerminalStatus } from '../lib/status';

interface TaskCardProps {
  task: Task;
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;

  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function TaskCard({ task }: TaskCardProps) {
  const setSelectedTask = useAppStore((s) => s.setSelectedTask);
  const fetchTaskDetail = useAppStore((s) => s.fetchTaskDetail);
  const cancelTask = useAppStore((s) => s.cancelTask);
  const deleteTask = useAppStore((s) => s.deleteTask);
  const setRestartingTask = useAppStore((s) => s.setRestartingTask);
  const selectedTaskId = useAppStore((s) => s.selectedTaskId);

  const isSelected = selectedTaskId === task.id;
  const terminal = isTerminalStatus(task.status);
  const canCancel = !terminal && task.status !== 'CANCELLED';
  const canRestart = task.status === 'CANCELLED' || task.status === 'FAILED';

  const handleView = () => {
    setSelectedTask(task.id);
    fetchTaskDetail(task.id);
  };

  const handleCancel = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('确定取消此任务？')) {
      await cancelTask(task.id);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('确定删除此任务？')) {
      await deleteTask(task.id);
    }
  };

  const handleRestart = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRestartingTask(task);
  };

  return (
    <div
      onClick={handleView}
      className={`card cursor-pointer transition-all hover:border-slate-700 ${
        isSelected ? 'border-brand-500/50 bg-brand-500/5' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <StatusBadge status={task.status} />
            <span className="text-xs text-slate-500">{formatTime(task.createdAt)}</span>
          </div>
          <h3 className="text-sm font-medium text-slate-200 truncate">
            {task.title || task.prompt.slice(0, 80)}
          </h3>
          {task.title && (
            <p className="mt-0.5 text-xs text-slate-500 truncate">
              {task.prompt.slice(0, 100)}
            </p>
          )}
          {task.errorMessage && (
            <p className="mt-1 text-xs text-red-400 truncate">
              {task.errorMessage}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {canCancel && (
            <button
              onClick={handleCancel}
              className="btn-ghost p-1.5 text-slate-500 hover:text-yellow-400"
              title="取消任务"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" />
              </svg>
            </button>
          )}
          {canRestart && (
            <button
              onClick={handleRestart}
              className="btn-ghost p-1.5 text-slate-500 hover:text-brand-400"
              title="重启任务"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
              </svg>
            </button>
          )}
          {terminal && (
            <button
              onClick={handleDelete}
              className="btn-ghost p-1.5 text-slate-500 hover:text-red-400"
              title="删除任务"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
