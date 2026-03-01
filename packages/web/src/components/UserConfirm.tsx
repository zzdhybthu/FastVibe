import { useState } from 'react';
import type { TaskInteraction } from '@vibecoding/shared';
import { useAppStore } from '../stores/app-store';

interface UserConfirmProps {
  interaction: TaskInteraction;
}

interface QuestionData {
  question?: string;
  text?: string;
  message?: string;
  options?: string[];
  [key: string]: unknown;
}

export default function UserConfirm({ interaction }: UserConfirmProps) {
  const answerInteraction = useAppStore((s) => s.answerInteraction);
  const [answer, setAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);

  let questionText = '';
  let options: string[] = [];

  try {
    const parsed: QuestionData = JSON.parse(interaction.questionData);
    questionText = parsed.question || parsed.text || parsed.message || JSON.stringify(parsed, null, 2);
    if (Array.isArray(parsed.options)) {
      options = parsed.options;
    }
  } catch {
    questionText = interaction.questionData;
  }

  const handleSubmit = async (value: string) => {
    if (!value.trim()) return;
    setSubmitting(true);
    try {
      await answerInteraction(interaction.id, value.trim());
    } catch {
      // error handled by store
    } finally {
      setSubmitting(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSubmit(answer);
  };

  return (
    <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-4 space-y-3">
      {/* Question */}
      <div className="flex items-start gap-2">
        <svg className="h-5 w-5 text-purple-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
        </svg>
        <p className="text-sm text-slate-200 whitespace-pre-wrap">{questionText}</p>
      </div>

      {/* Quick option buttons */}
      {options.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {options.map((opt) => (
            <button
              key={opt}
              onClick={() => handleSubmit(opt)}
              disabled={submitting}
              className="btn-secondary text-sm"
            >
              {opt}
            </button>
          ))}
        </div>
      )}

      {/* Free text input */}
      <form onSubmit={handleFormSubmit} className="flex gap-2">
        <input
          type="text"
          className="input flex-1"
          placeholder="输入回答..."
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          disabled={submitting}
          autoFocus
        />
        <button type="submit" className="btn-primary shrink-0" disabled={submitting || !answer.trim()}>
          {submitting ? (
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
            </svg>
          )}
        </button>
      </form>
    </div>
  );
}
