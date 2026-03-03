import type { TaskStatus } from '@vibecoding/shared';
import { useLanguageStore } from '../stores/language-store';
import type { Language } from '../stores/language-store';

const STATUS_LABELS: Record<TaskStatus, Record<Language, string>> = {
  PENDING: { zh: '等待中', en: 'Pending' },
  QUEUED: { zh: '排队中', en: 'Queued' },
  RUNNING: { zh: '运行中', en: 'Running' },
  AWAITING_INPUT: { zh: '待确认', en: 'Awaiting' },
  COMPLETED: { zh: '已完成', en: 'Completed' },
  FAILED: { zh: '失败', en: 'Failed' },
  CANCELLED: { zh: '已取消', en: 'Cancelled' },
};

const STATUS_STYLES: Record<TaskStatus, { color: string; bg: string; cardTint: string }> = {
  PENDING: { color: 'text-ink-muted', bg: 'bg-ink-muted/10 border-ink-muted/20', cardTint: 'bg-blue-500/5 border-blue-500/10' },
  QUEUED: { color: 'text-blue-400', bg: 'bg-blue-400/10 border-blue-400/20', cardTint: 'bg-blue-500/5 border-blue-500/10' },
  RUNNING: { color: 'text-yellow-400', bg: 'bg-yellow-400/10 border-yellow-400/20', cardTint: 'bg-yellow-500/5 border-yellow-500/10' },
  AWAITING_INPUT: { color: 'text-purple-400', bg: 'bg-purple-400/10 border-purple-400/20', cardTint: 'bg-purple-500/5 border-purple-500/10' },
  COMPLETED: { color: 'text-green-400', bg: 'bg-green-400/10 border-green-400/20', cardTint: 'bg-green-500/5 border-green-500/10' },
  FAILED: { color: 'text-red-400', bg: 'bg-red-400/10 border-red-400/20', cardTint: 'bg-red-500/5 border-red-500/10' },
  CANCELLED: { color: 'text-ink-hint', bg: 'bg-ink-hint/10 border-ink-hint/20', cardTint: '' },
};

export function getStatusConfig(status: TaskStatus, language?: Language) {
  const lang = language ?? 'zh';
  const styles = STATUS_STYLES[status] || STATUS_STYLES.PENDING;
  const labels = STATUS_LABELS[status] || STATUS_LABELS.PENDING;
  return { ...styles, label: labels[lang] };
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  const language = useLanguageStore((s) => s.language);
  const config = getStatusConfig(status, language);
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
