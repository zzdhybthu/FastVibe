import { useEffect, useRef } from 'react';
import type { TaskLog } from '@vibecoding/shared';

interface LogViewerProps {
  logs: TaskLog[];
}

const LEVEL_STYLES: Record<string, string> = {
  info: 'text-slate-400',
  warn: 'text-yellow-400',
  error: 'text-red-400',
  debug: 'text-blue-400',
};

const LEVEL_LABELS: Record<string, string> = {
  info: 'INFO',
  warn: 'WARN',
  error: 'ERR ',
  debug: 'DBG ',
};

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function LogViewer({ logs }: LogViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !shouldAutoScroll.current) return;
    el.scrollTop = el.scrollHeight;
  }, [logs]);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    // If user scrolled up more than 50px from bottom, disable auto-scroll
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    shouldAutoScroll.current = atBottom;
  };

  if (logs.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-slate-600">
        暂无日志
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="max-h-[400px] overflow-y-auto rounded-lg bg-slate-950 border border-slate-800 p-3 font-mono text-xs leading-relaxed"
    >
      {logs.map((log, i) => (
        <div key={log.id || i} className="flex gap-2 hover:bg-slate-900/50 px-1 py-0.5 rounded">
          <span className="shrink-0 text-slate-600">{formatTimestamp(log.timestamp)}</span>
          <span className={`shrink-0 font-semibold ${LEVEL_STYLES[log.level] || LEVEL_STYLES.info}`}>
            {LEVEL_LABELS[log.level] || 'INFO'}
          </span>
          <span className={`break-all ${LEVEL_STYLES[log.level] || LEVEL_STYLES.info}`}>
            {log.message}
          </span>
        </div>
      ))}
    </div>
  );
}
