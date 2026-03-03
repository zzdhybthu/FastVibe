import { useEffect, useRef, useState } from 'react';
import type { TaskLog } from '@vibecoding/shared';
import { useT } from '../i18n';

interface LogViewerProps {
  logs: TaskLog[];
}

const LEVEL_STYLES: Record<string, string> = {
  info: 'text-ink-muted',
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
  const t = useT();

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

  const [copied, setCopied] = useState(false);

  const handleCopyAll = async () => {
    const text = logs
      .map((log) => `${formatTimestamp(log.timestamp)} ${LEVEL_LABELS[log.level] || 'INFO'} ${log.message}`)
      .join('\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (logs.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-ink-faint">
        {t.logViewer.noLogs}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={handleCopyAll}
        className="absolute top-2 right-2 z-10 p-1 rounded text-ink-hint hover:text-ink-2 hover:bg-th-hover transition-colors"
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
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="max-h-[400px] overflow-y-auto rounded-lg bg-th-page border border-th-border p-3 pr-9 font-mono text-xs leading-relaxed"
      >
      {logs.map((log, i) => (
        <div key={log.id || i} className="flex flex-wrap sm:flex-nowrap gap-x-2 hover:bg-th-surface px-1 py-0.5 rounded">
          <span className="shrink-0 text-ink-faint">{formatTimestamp(log.timestamp)}</span>
          <span className={`shrink-0 font-semibold ${LEVEL_STYLES[log.level] || LEVEL_STYLES.info}`}>
            {LEVEL_LABELS[log.level] || 'INFO'}
          </span>
          <span className={`w-full sm:w-auto break-all ${LEVEL_STYLES[log.level] || LEVEL_STYLES.info}`}>
            {log.message}
          </span>
        </div>
      ))}
      </div>
    </div>
  );
}
