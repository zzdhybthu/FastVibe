import { useState } from 'react';
import type { CreateRepoRequest } from '@fastvibe/shared';
import { useAppStore } from '../stores/app-store';
import { useThemeStore } from '../stores/theme-store';
import { useConfirm } from '../stores/confirm-store';
import { useLanguageStore } from '../stores/language-store';
import { useT } from '../i18n';
import CustomSelect from './CustomSelect';

interface ConfigPanelProps {
  onClose: () => void;
}

export default function ConfigPanel({ onClose }: ConfigPanelProps) {
  const repos = useAppStore((s) => s.repos);
  const createRepo = useAppStore((s) => s.createRepo);
  const updateRepo = useAppStore((s) => s.updateRepo);
  const deleteRepo = useAppStore((s) => s.deleteRepo);
  const setToken = useAppStore((s) => s.setToken);
  const agentDefaults = useAppStore((s) => s.agentDefaults);
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggle);
  const confirm = useConfirm();
  const language = useLanguageStore((s) => s.language);
  const setLanguage = useLanguageStore((s) => s.setLanguage);
  const voiceLang = useLanguageStore((s) => s.voiceLang);
  const setVoiceLang = useLanguageStore((s) => s.setVoiceLang);
  const t = useT();

  const [editingRepoId, setEditingRepoId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-th-border-strong bg-th-surface shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-th-border bg-th-surface px-6 py-4">
          <h2 className="text-lg font-semibold text-ink">{t.config.title}</h2>
          <button onClick={onClose} className="btn-ghost p-1.5">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-4 space-y-6">
          {/* Interface settings */}
          <section>
            <h3 className="text-sm font-semibold text-ink-2 uppercase tracking-wider mb-3">{t.config.interfaceSettings}</h3>
            <div className="card flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-ink-3">{t.config.language}</span>
                <CustomSelect
                  className="w-28 text-sm"
                  options={[
                    { value: 'zh', label: t.common.zh },
                    { value: 'en', label: t.common.en },
                  ]}
                  value={language}
                  onChange={(val) => setLanguage(val as 'zh' | 'en')}
                />
              </div>
              <button
                onClick={toggleTheme}
                className="btn-ghost flex items-center gap-1.5 px-2.5 py-1.5 text-sm"
              >
                {theme === 'dark' ? (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                  </svg>
                )}
                <span className="hidden sm:inline">{theme === 'dark' ? t.config.darkMode : t.config.lightMode}</span>
              </button>
            </div>
            {agentDefaults && (
              <div className="card flex items-center gap-2 mt-2">
                <span className="text-sm font-medium text-ink-3">{t.config.defaultAgent}</span>
                <span className="badge border border-th-border-strong bg-th-elevated text-ink-hint">
                  {agentDefaults.defaultAgent === 'codex' ? 'Codex' : 'Claude Code'}
                </span>
                <span className="text-xs text-ink-faint ml-auto">{t.config.defaultAgentDesc}</span>
              </div>
            )}
          </section>

          {/* Repo management */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-ink-2 uppercase tracking-wider">{t.config.repoManagement}</h3>
              <button
                onClick={() => { setShowAddForm(true); setEditingRepoId(null); }}
                className="btn-primary text-xs"
              >
                <svg className="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                {t.config.addRepo}
              </button>
            </div>

            {/* Add form */}
            {showAddForm && (
              <RepoForm
                onSubmit={async (data) => {
                  await createRepo(data);
                  setShowAddForm(false);
                }}
                onCancel={() => setShowAddForm(false)}
              />
            )}

            {/* Repo list */}
            <div className="space-y-2">
              {repos.length === 0 && !showAddForm ? (
                <p className="text-sm text-ink-hint py-4 text-center">{t.config.noRepos}</p>
              ) : (
                repos.map((repo) => (
                  <div key={repo.id}>
                    {editingRepoId === repo.id ? (
                      <RepoForm
                        initial={{
                          path: repo.path,
                          name: repo.name,
                          mainBranch: repo.mainBranch,
                          maxConcurrency: repo.maxConcurrency,
                        }}
                        onSubmit={async (data) => {
                          await updateRepo(repo.id, data);
                          setEditingRepoId(null);
                        }}
                        onCancel={() => setEditingRepoId(null)}
                      />
                    ) : (
                      <div className="card flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <span className="text-sm font-medium text-ink-2">{repo.name}</span>
                          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mt-1">
                            <span className="badge border border-th-border-strong bg-th-elevated text-ink-hint w-fit">
                              {repo.mainBranch}
                            </span>
                            <span className="badge border border-th-border-strong bg-th-elevated text-ink-hint w-fit">
                              {t.config.concurrency} {repo.maxConcurrency}
                            </span>
                          </div>
                          <p className="text-xs text-ink-hint truncate mt-1 font-mono">{repo.path}</p>
                        </div>
                        <div className="flex flex-col sm:flex-row items-center gap-1 shrink-0">
                          <button
                            onClick={() => { setEditingRepoId(repo.id); setShowAddForm(false); }}
                            className="btn-ghost p-1.5 text-ink-hint hover:text-brand-400"
                            title={t.config.edit}
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                            </svg>
                          </button>
                          <button
                            onClick={async () => {
                              if (await confirm(t.config.confirmDeleteRepo(repo.name))) {
                                await deleteRepo(repo.id);
                              }
                            }}
                            className="btn-ghost p-1.5 text-ink-hint hover:text-red-400"
                            title={t.config.delete}
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Voice settings */}
          <section>
            <h3 className="text-sm font-semibold text-ink-2 uppercase tracking-wider mb-3">{t.config.voiceSettings}</h3>
            <div className="card flex items-center gap-2">
              <span className="text-sm font-medium text-ink-3">{t.config.language}</span>
              <CustomSelect
                className="w-28 text-sm"
                options={[
                  { value: 'zh', label: t.common.zh },
                  { value: 'en', label: t.common.en },
                ]}
                value={voiceLang}
                onChange={(val) => setVoiceLang(val as 'zh' | 'en')}
              />
            </div>
          </section>

          {/* About */}
          <section>
            <h3 className="text-sm font-semibold text-ink-2 uppercase tracking-wider mb-3">{t.config.about}</h3>
            <div className="card text-sm text-ink-muted space-y-1">
              <p>{t.config.aboutTitle}</p>
              <p className="text-xs text-ink-faint">
                <a href={`https://${t.config.aboutDesc}`} target="_blank" rel="noopener noreferrer" className="hover:text-brand-400 transition-colors">{t.config.aboutDesc}</a>
              </p>
            </div>
          </section>

          {/* Logout */}
          <section>
            <button
              onClick={async () => { if (await confirm(t.config.confirmLogout)) { onClose(); setToken(null); } }}
              className="w-full card flex items-center justify-center gap-2 py-2.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/5 transition-colors cursor-pointer"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
              </svg>
              {t.config.logout}
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}

// --- RepoForm sub-component ---

interface RepoFormProps {
  initial?: CreateRepoRequest;
  onSubmit: (data: CreateRepoRequest) => Promise<void>;
  onCancel: () => void;
}

function RepoForm({ initial, onSubmit, onCancel }: RepoFormProps) {
  const t = useT();
  const [form, setForm] = useState<CreateRepoRequest>({
    path: initial?.path || '',
    name: initial?.name || '',
    mainBranch: initial?.mainBranch || 'main',
    maxConcurrency: initial?.maxConcurrency || 3,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.path || !form.name) {
      setError(t.config.fillRequired);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onSubmit(form);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const update = (key: keyof CreateRepoRequest, value: string | number) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  return (
    <form onSubmit={handleSubmit} className="card border-brand-500/30 space-y-3 mb-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-ink-hint mb-1">{t.config.repoName} *</label>
          <input
            className="input text-sm"
            placeholder="my-project"
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs text-ink-hint mb-1">{t.config.repoPath} *</label>
          <input
            className="input text-sm font-mono"
            placeholder="/home/user/project"
            value={form.path}
            onChange={(e) => update('path', e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs text-ink-hint mb-1">{t.config.mainBranch}</label>
          <input
            className="input text-sm"
            placeholder="main"
            value={form.mainBranch}
            onChange={(e) => update('mainBranch', e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs text-ink-hint mb-1">{t.config.maxConcurrency}</label>
          <input
            type="number"
            className="input text-sm"
            min={1}
            max={20}
            value={form.maxConcurrency}
            onChange={(e) => update('maxConcurrency', parseInt(e.target.value) || 1)}
          />
        </div>
      </div>

      {error && (
        <div className="text-xs text-red-400">{error}</div>
      )}

      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onCancel} className="btn-ghost text-xs">
          {t.config.cancel}
        </button>
        <button type="submit" className="btn-primary text-xs" disabled={submitting}>
          {submitting ? t.config.saving : (initial ? t.config.save : t.config.add)}
        </button>
      </div>
    </form>
  );
}
