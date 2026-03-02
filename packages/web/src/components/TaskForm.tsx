import { useState, useEffect, useCallback, useRef } from 'react';
import { useAppStore } from '../stores/app-store';
import { useLanguageStore } from '../stores/language-store';
import { useT } from '../i18n';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
interface TaskFormProps {
  onClose: () => void;
}

export default function TaskForm({ onClose }: TaskFormProps) {
  const createTask = useAppStore((s) => s.createTask);
  const tasks = useAppStore((s) => s.tasks);
  const claudeDefaults = useAppStore((s) => s.claudeDefaults);
  const fetchClaudeDefaults = useAppStore((s) => s.fetchClaudeDefaults);
  const uiLanguage = useLanguageStore((s) => s.language);
  const voiceLang = useLanguageStore((s) => s.voiceLang);
  const t = useT();

  const [prompt, setPrompt] = useState('');
  const [title, setTitle] = useState('');
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [predecessorTaskId, setPredecessorTaskId] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [model, setModel] = useState('');
  const [maxBudgetUsd, setMaxBudgetUsd] = useState('');
  const [interactionTimeout, setInteractionTimeout] = useState('');
  const [taskLanguage, setTaskLanguage] = useState<'zh' | 'en'>(uiLanguage);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Speech recognition
  const promptBeforeVoiceRef = useRef('');
  const handleVoiceResult = useCallback((text: string) => {
    const base = promptBeforeVoiceRef.current;
    setPrompt(base ? base + ' ' + text : text);
  }, []);
  const { isListening, isSupported, start: startVoice, stop: stopVoice } = useSpeechRecognition({
    lang: voiceLang,
    onResult: handleVoiceResult,
  });
  const toggleVoice = useCallback(() => {
    if (isListening) {
      stopVoice();
    } else {
      promptBeforeVoiceRef.current = prompt;
      startVoice();
    }
  }, [isListening, prompt, startVoice, stopVoice]);

  const eligiblePredecessors = tasks.filter((t) => t.status !== 'FAILED' && t.status !== 'CANCELLED');

  useEffect(() => {
    if (!claudeDefaults) {
      fetchClaudeDefaults();
    }
  }, [claudeDefaults, fetchClaudeDefaults]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) {
      setError(t.taskForm.promptRequired);
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
        language: taskLanguage,
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
      <div className="relative w-full max-w-lg rounded-2xl border border-th-border-strong bg-th-surface shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-th-border px-6 py-4">
          <h2 className="text-lg font-semibold text-ink">{t.taskForm.title}</h2>
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
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium text-ink-3">
                {t.taskForm.promptLabel} <span className="text-red-400">*</span>
              </label>
              {isSupported && (
                <button
                  type="button"
                  onClick={toggleVoice}
                  className={`flex items-center justify-center w-10 h-10 rounded-lg transition-colors ${
                    isListening
                      ? 'bg-red-500/15 text-red-400'
                      : 'text-ink-muted hover:text-ink-2 hover:bg-th-elevated'
                  }`}
                  title={isListening ? t.taskForm.voiceListening : t.taskForm.voiceInput}
                  disabled={submitting}
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                  </svg>
                </button>
              )}
            </div>
            <textarea
              className="input min-h-[120px] resize-y font-mono text-sm"
              placeholder={t.taskForm.promptPlaceholder}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              autoFocus
              disabled={submitting}
            />
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-ink-3 mb-1.5">
              {t.taskForm.titleLabel} <span className="text-ink-hint">{t.taskForm.titleOptional}</span>
            </label>
            <input
              type="text"
              className="input"
              placeholder={t.taskForm.titlePlaceholder}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={submitting}
            />
          </div>

          {/* Thinking mode toggle */}
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-ink-3">{t.taskForm.thinkingMode}</span>
              <p className="text-xs text-ink-hint">{t.taskForm.thinkingModeDesc}</p>
            </div>
            <button
              type="button"
              onClick={() => setThinkingEnabled(!thinkingEnabled)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                thinkingEnabled ? 'bg-brand-600' : 'bg-th-muted'
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
          {eligiblePredecessors.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-ink-3 mb-1.5">
                {t.taskForm.predecessorTask} <span className="text-ink-hint">{t.taskForm.titleOptional}</span>
              </label>
              <select
                className="input"
                value={predecessorTaskId}
                onChange={(e) => setPredecessorTaskId(e.target.value)}
                disabled={submitting}
              >
                <option value="">{t.taskForm.noPredecessor}</option>
                {eligiblePredecessors.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.title || task.prompt.slice(0, 60)} ({task.status})
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-ink-hint">
                {t.taskForm.predecessorDesc}
              </p>
            </div>
          )}

          {/* Advanced settings toggle */}
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink-2 transition-colors"
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
            {t.taskForm.advancedSettings}
          </button>

          {/* Advanced settings */}
          {showAdvanced && (
            <div className="space-y-3 rounded-lg border border-th-border bg-th-input p-4">
              {/* Model */}
              <div>
                <label className="block text-sm font-medium text-ink-3 mb-1.5">{t.taskForm.model}</label>
                {claudeDefaults && claudeDefaults.models.length > 0 ? (
                  <select
                    className="input"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    disabled={submitting}
                  >
                    <option value="">{t.taskForm.modelDefault(claudeDefaults.defaultModel)}</option>
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
                <label className="block text-sm font-medium text-ink-3 mb-1.5">
                  {t.taskForm.maxBudget}
                </label>
                <input
                  type="number"
                  className="input"
                  placeholder={claudeDefaults ? String(claudeDefaults.maxBudgetUsd) : '5.0'}
                  value={maxBudgetUsd}
                  onChange={(e) => setMaxBudgetUsd(e.target.value)}
                  disabled={submitting}
                  min="0.01"
                  step="any"
                />
              </div>

              {/* Interaction timeout */}
              <div>
                <label className="block text-sm font-medium text-ink-3 mb-1.5">
                  {t.taskForm.interactionTimeout}
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

              {/* Task language */}
              <div>
                <label className="block text-sm font-medium text-ink-3 mb-1.5">
                  {t.taskForm.taskLanguage}
                </label>
                <select
                  className="input"
                  value={taskLanguage}
                  onChange={(e) => setTaskLanguage(e.target.value as 'zh' | 'en')}
                  disabled={submitting}
                >
                  <option value="zh">{t.taskForm.langZh}</option>
                  <option value="en">{t.taskForm.langEn}</option>
                </select>
                <p className="mt-1 text-xs text-ink-hint">{t.taskForm.taskLanguageDesc}</p>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 border-t border-th-border pt-4">
            <button type="button" onClick={onClose} className="btn-secondary" disabled={submitting}>
              {t.taskForm.cancel}
            </button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? (
                <span className="flex items-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {t.taskForm.creating}
                </span>
              ) : (
                t.taskForm.createTask
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
