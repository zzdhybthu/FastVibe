import { useState } from 'react';
import { useAppStore } from '../stores/app-store';
import { useT } from '../i18n';
import { fetchRepos } from '../lib/api';

export default function AuthScreen() {
  const setToken = useAppStore((s) => s.setToken);
  const t = useT();
  const [inputToken, setInputToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputToken.trim();
    if (!trimmed) {
      setError(t.auth.tokenRequired);
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Temporarily set token to validate
      localStorage.setItem('vibecoding_token', trimmed);
      await fetchRepos();
      // Success - set in store
      setToken(trimmed);
    } catch {
      localStorage.removeItem('vibecoding_token');
      setError(t.auth.invalidToken);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="card space-y-6">
          {/* Header */}
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-600/20">
              <svg className="h-8 w-8 text-brand-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-ink">{t.auth.title}</h1>
            <p className="mt-1 text-sm text-ink-muted">{t.auth.subtitle}</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="token" className="block text-sm font-medium text-ink-3 mb-1.5">
                {t.auth.tokenLabel}
              </label>
              <input
                id="token"
                type="password"
                className="input"
                placeholder={t.auth.tokenPlaceholder}
                value={inputToken}
                onChange={(e) => setInputToken(e.target.value)}
                autoFocus
                disabled={loading}
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-400">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="btn-primary w-full"
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {t.auth.validating}
                </span>
              ) : (
                t.auth.login
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
