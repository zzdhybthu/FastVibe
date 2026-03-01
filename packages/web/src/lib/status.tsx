import type { TaskStatus } from '@vibecoding/shared';

const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; bg: string }> = {
  PENDING: { label: '等待中', color: 'text-ink-muted', bg: 'bg-ink-muted/10 border-ink-muted/20' },
  QUEUED: { label: '排队中', color: 'text-blue-400', bg: 'bg-blue-400/10 border-blue-400/20' },
  RUNNING: { label: '运行中', color: 'text-yellow-400', bg: 'bg-yellow-400/10 border-yellow-400/20' },
  AWAITING_INPUT: { label: '待确认', color: 'text-purple-400', bg: 'bg-purple-400/10 border-purple-400/20' },
  COMPLETED: { label: '已完成', color: 'text-green-400', bg: 'bg-green-400/10 border-green-400/20' },
  FAILED: { label: '失败', color: 'text-red-400', bg: 'bg-red-400/10 border-red-400/20' },
  CANCELLED: { label: '已取消', color: 'text-ink-hint', bg: 'bg-ink-hint/10 border-ink-hint/20' },
};

export function getStatusConfig(status: TaskStatus) {
  return STATUS_CONFIG[status] || STATUS_CONFIG.PENDING;
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  const config = getStatusConfig(status);
  return (
    <span className={`badge border ${config.bg} ${config.color}`}>
      {status === 'RUNNING' && (
        <span className="mr-1 h-1.5 w-1.5 rounded-full bg-yellow-400 animate-pulse" />
      )}
      {status === 'AWAITING_INPUT' && (
        <span className="mr-1 h-1.5 w-1.5 rounded-full bg-purple-400 animate-pulse" />
      )}
      {config.label}
    </span>
  );
}

export function isTerminalStatus(status: TaskStatus): boolean {
  return status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED';
}
