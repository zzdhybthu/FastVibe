import { useState, useEffect } from 'react';
import { useAppStore } from '../stores/app-store';
import { isTerminalStatus } from '../lib/status';

interface TaskFormProps {
  onClose: () => void;
}

export default function TaskForm({ onClose }: TaskFormProps) {
  const createTask = useAppStore((s) => s.createTask);
  const tasks = useAppStore((s) => s.tasks);
  const claudeDefaults = useAppStore((s) => s.claudeDefaults);
  const fetchClaudeDefaults = useAppStore((s) => s.fetchClaudeDefaults);
  const [prompt, setPrompt] = useState('');
  const [title, setTitle] = useState('');
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [predecessorTaskId, setPredecessorTaskId] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [model, setModel] = useState('');
  const [maxBudgetUsd, setMaxBudgetUsd] = useState('');
  const [interactionTimeout, setInteractionTimeout] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const terminalTasks = tasks.filter((t) => isTerminalStatus(t.status));

  useEffect(() => {
    if (!claudeDefaults) {
      fetchClaudeDefaults();
    }
  }, [claudeDefaults, fetchClaudeDefaults]);

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
        model: model || undefined,
        maxBudgetUsd: maxBudgetUsd ? parseFloat(maxBudgetUsd) : undefined,
        interactionTimeout: interactionTimeout ? parseInt(interactionTimeout, 10) : undefined,
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
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl max-h-[90vh] overflow-y-auto">
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
                新任务将在前置任务完成后才开始执行
              </p>
            </div>
          )}

          {/* Advanced settings toggle */}
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors"
          >
            <svg
              className={`h-4 w-4 transition-transform ${showAdvanced ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
            高级设置
          </button>

          {/* Advanced settings */}
          {showAdvanced && (
            <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-800/50 p-4">
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
                    <option value="">默认 ({claudeDefaults.defaultModel})</option>
                    {claudeDefaults.models.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    className="input"
                    placeholder={claudeDefaults?.defaultModel ?? 'claude-sonnet-4-6'}
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
                  placeholder={claudeDefaults ? String(claudeDefaults.maxBudgetUsd) : '5.0'}
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
                  placeholder={claudeDefaults ? String(claudeDefaults.interactionTimeout) : '1800'}
                  value={interactionTimeout}
                  onChange={(e) => setInteractionTimeout(e.target.value)}
                  disabled={submitting}
                  min="60"
                  step="60"
                />
              </div>
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
