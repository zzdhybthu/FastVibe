import { useState, useEffect } from 'react';
import type { Task } from '@vibecoding/shared';
import { useAppStore } from '../stores/app-store';

export default function RestartDialog() {
  const restartingTask = useAppStore((s) => s.restartingTask);
  const setRestartingTask = useAppStore((s) => s.setRestartingTask);
  const restartTask = useAppStore((s) => s.restartTask);
  const claudeDefaults = useAppStore((s) => s.claudeDefaults);
  const fetchClaudeDefaults = useAppStore((s) => s.fetchClaudeDefaults);

  const [model, setModel] = useState('');
  const [maxBudgetUsd, setMaxBudgetUsd] = useState('');
  const [interactionTimeout, setInteractionTimeout] = useState('');
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!claudeDefaults) {
      fetchClaudeDefaults();
    }
  }, [claudeDefaults, fetchClaudeDefaults]);

  // Pre-fill with original task values when task changes
  useEffect(() => {
    if (restartingTask) {
      setModel(restartingTask.model);
      setMaxBudgetUsd(String(restartingTask.maxBudgetUsd));
      setInteractionTimeout(String(restartingTask.interactionTimeout));
      setThinkingEnabled(restartingTask.thinkingEnabled);
      setError('');
    }
  }, [restartingTask]);

  if (!restartingTask) return null;

  const handleClose = () => setRestartingTask(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      await restartTask(restartingTask.id, {
        model: model || undefined,
        maxBudgetUsd: maxBudgetUsd ? parseFloat(maxBudgetUsd) : undefined,
        interactionTimeout: interactionTimeout ? parseInt(interactionTimeout, 10) : undefined,
        thinkingEnabled,
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-100">重启任务</h2>
          <button onClick={handleClose} className="btn-ghost p-1.5">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Task info */}
        <div className="px-6 pt-4">
          <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">原任务</h3>
          <p className="text-sm text-slate-300 truncate">{restartingTask.title || restartingTask.prompt.slice(0, 80)}</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-4">
          {/* Model */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">模型</label>
            {claudeDefaults && claudeDefaults.models.length > 0 ? (
              <select
                className="input"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                disabled={submitting}
              >
                {claudeDefaults.models.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                className="input"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                disabled={submitting}
              />
            )}
          </div>

          {/* Max budget */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              最大预算 (USD)
            </label>
            <input
              type="number"
              className="input"
              value={maxBudgetUsd}
              onChange={(e) => setMaxBudgetUsd(e.target.value)}
              disabled={submitting}
              min="0.01"
              step="0.1"
            />
          </div>

          {/* Interaction timeout */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              交互超时 (秒)
            </label>
            <input
              type="number"
              className="input"
              value={interactionTimeout}
              onChange={(e) => setInteractionTimeout(e.target.value)}
              disabled={submitting}
              min="60"
              step="60"
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

          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 border-t border-slate-800 pt-4">
            <button type="button" onClick={handleClose} className="btn-secondary" disabled={submitting}>
              取消
            </button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? (
                <span className="flex items-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  重启中...
                </span>
              ) : (
                '确认重启'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
