import { useState } from 'react';
import { useAppStore } from '../stores/app-store';
import { isTerminalStatus } from '../lib/status';

interface TaskFormProps {
  onClose: () => void;
}

export default function TaskForm({ onClose }: TaskFormProps) {
  const createTask = useAppStore((s) => s.createTask);
  const tasks = useAppStore((s) => s.tasks);
  const [prompt, setPrompt] = useState('');
  const [title, setTitle] = useState('');
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [predecessorTaskId, setPredecessorTaskId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const terminalTasks = tasks.filter((t) => isTerminalStatus(t.status));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) {
      setError('请输入任务提示词');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      await createTask({
        prompt: prompt.trim(),
        title: title.trim() || undefined,
        thinkingEnabled,
        predecessorTaskId: predecessorTaskId || undefined,
      });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-100">新建任务</h2>
          <button onClick={onClose} className="btn-ghost p-1.5">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-4">
          {/* Prompt */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              任务提示词 <span className="text-red-400">*</span>
            </label>
            <textarea
              className="input min-h-[120px] resize-y font-mono text-sm"
              placeholder="描述你希望 Claude Code 完成的任务..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              autoFocus
              disabled={submitting}
            />
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              任务标题 <span className="text-slate-500">(可选)</span>
            </label>
            <input
              type="text"
              className="input"
              placeholder="简短描述，用于列表展示"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={submitting}
            />
          </div>

          {/* Thinking mode toggle */}
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-slate-300">思考模式</span>
              <p className="text-xs text-slate-500">启用后 Claude 会进行更深入的推理</p>
            </div>
            <button
              type="button"
              onClick={() => setThinkingEnabled(!thinkingEnabled)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                thinkingEnabled ? 'bg-brand-600' : 'bg-slate-700'
              }`}
              disabled={submitting}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transition-transform ${
                  thinkingEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Predecessor task */}
          {terminalTasks.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                前置任务 <span className="text-slate-500">(可选)</span>
              </label>
              <select
                className="input"
                value={predecessorTaskId}
                onChange={(e) => setPredecessorTaskId(e.target.value)}
                disabled={submitting}
              >
                <option value="">无前置任务</option>
                {terminalTasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title || t.prompt.slice(0, 60)} ({t.status})
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">
                选择前置任务后，新任务将基于前置任务的分支创建
              </p>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 border-t border-slate-800 pt-4">
            <button type="button" onClick={onClose} className="btn-secondary" disabled={submitting}>
              取消
            </button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? (
                <span className="flex items-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  创建中...
                </span>
              ) : (
                '创建任务'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
