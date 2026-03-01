import { useConfirmStore } from '../stores/confirm-store';

export default function ConfirmDialog() {
  const open = useConfirmStore((s) => s.open);
  const message = useConfirmStore((s) => s.message);
  const close = useConfirmStore((s) => s.close);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => close(false)} />

      {/* Dialog */}
      <div className="relative w-full max-w-sm rounded-2xl border border-th-border-strong bg-th-surface shadow-2xl">
        <div className="px-6 pt-6 pb-2">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-yellow-500/10">
              <svg className="h-5 w-5 text-yellow-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-ink">确认操作</h3>
              <p className="mt-1 text-sm text-ink-muted whitespace-pre-wrap">{message}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4">
          <button
            onClick={() => close(false)}
            className="btn-secondary"
            autoFocus
          >
            取消
          </button>
          <button
            onClick={() => close(true)}
            className="btn-primary"
          >
            确认
          </button>
        </div>
      </div>
    </div>
  );
}
