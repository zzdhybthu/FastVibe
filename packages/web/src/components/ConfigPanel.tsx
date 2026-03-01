import { useState } from 'react';
import type { CreateRepoRequest } from '@vibecoding/shared';
import { useAppStore } from '../stores/app-store';

interface ConfigPanelProps {
  onClose: () => void;
}

export default function ConfigPanel({ onClose }: ConfigPanelProps) {
  const repos = useAppStore((s) => s.repos);
  const createRepo = useAppStore((s) => s.createRepo);
  const updateRepo = useAppStore((s) => s.updateRepo);
  const deleteRepo = useAppStore((s) => s.deleteRepo);

  const [editingRepoId, setEditingRepoId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-800 bg-slate-900 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-100">设置</h2>
          <button onClick={onClose} className="btn-ghost p-1.5">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-4 space-y-6">
          {/* Repo management */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">仓库管理</h3>
              <button
                onClick={() => { setShowAddForm(true); setEditingRepoId(null); }}
                className="btn-primary text-xs"
              >
                <svg className="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                添加仓库
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
                <p className="text-sm text-slate-500 py-4 text-center">暂无仓库，点击上方按钮添加</p>
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
                          gitUser: repo.gitUser,
                          gitEmail: repo.gitEmail,
                        }}
                        onSubmit={async (data) => {
                          await updateRepo(repo.id, data);
                          setEditingRepoId(null);
                        }}
                        onCancel={() => setEditingRepoId(null)}
                      />
                    ) : (
                      <div className="card flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-slate-200">{repo.name}</span>
                            <span className="badge border border-slate-700 bg-slate-800 text-slate-500">
                              {repo.mainBranch}
                            </span>
                            <span className="badge border border-slate-700 bg-slate-800 text-slate-500">
                              并发: {repo.maxConcurrency}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 truncate mt-0.5 font-mono">{repo.path}</p>
                          <p className="text-xs text-slate-600 mt-0.5">
                            {repo.gitUser} &lt;{repo.gitEmail}&gt;
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => { setEditingRepoId(repo.id); setShowAddForm(false); }}
                            className="btn-ghost p-1.5 text-slate-500 hover:text-brand-400"
                            title="编辑"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                            </svg>
                          </button>
                          <button
                            onClick={async () => {
                              if (confirm(`确定删除仓库 "${repo.name}"？`)) {
                                await deleteRepo(repo.id);
                              }
                            }}
                            className="btn-ghost p-1.5 text-slate-500 hover:text-red-400"
                            title="删除"
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

          {/* About */}
          <section>
            <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider mb-3">关于</h3>
            <div className="card text-sm text-slate-400 space-y-1">
              <p>VibeCoding 编排中心 v0.1.0</p>
              <p className="text-xs text-slate-600">
                基于胡渊鸣《我给 10 个 Claude Code 打工》构建的并行化开发工具
              </p>
            </div>
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
  const [form, setForm] = useState<CreateRepoRequest>({
    path: initial?.path || '',
    name: initial?.name || '',
    mainBranch: initial?.mainBranch || 'main',
    maxConcurrency: initial?.maxConcurrency || 3,
    gitUser: initial?.gitUser || '',
    gitEmail: initial?.gitEmail || '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.path || !form.name || !form.gitUser || !form.gitEmail) {
      setError('请填写所有必填项');
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
          <label className="block text-xs text-slate-500 mb-1">仓库名称 *</label>
          <input
            className="input text-sm"
            placeholder="my-project"
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">本地路径 *</label>
          <input
            className="input text-sm font-mono"
            placeholder="/home/user/project"
            value={form.path}
            onChange={(e) => update('path', e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">主分支</label>
          <input
            className="input text-sm"
            placeholder="main"
            value={form.mainBranch}
            onChange={(e) => update('mainBranch', e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">最大并发</label>
          <input
            type="number"
            className="input text-sm"
            min={1}
            max={20}
            value={form.maxConcurrency}
            onChange={(e) => update('maxConcurrency', parseInt(e.target.value) || 1)}
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Git 用户名 *</label>
          <input
            className="input text-sm"
            placeholder="Your Name"
            value={form.gitUser}
            onChange={(e) => update('gitUser', e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Git 邮箱 *</label>
          <input
            type="email"
            className="input text-sm"
            placeholder="you@example.com"
            value={form.gitEmail}
            onChange={(e) => update('gitEmail', e.target.value)}
          />
        </div>
      </div>

      {error && (
        <div className="text-xs text-red-400">{error}</div>
      )}

      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onCancel} className="btn-ghost text-xs">
          取消
        </button>
        <button type="submit" className="btn-primary text-xs" disabled={submitting}>
          {submitting ? '保存中...' : (initial ? '保存' : '添加')}
        </button>
      </div>
    </form>
  );
}
