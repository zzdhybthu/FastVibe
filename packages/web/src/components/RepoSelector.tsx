import { useState } from 'react';
import { useAppStore } from '../stores/app-store';

export default function RepoSelector() {
  const repos = useAppStore((s) => s.repos);
  const selectedRepoId = useAppStore((s) => s.selectedRepoId);
  const selectRepo = useAppStore((s) => s.selectRepo);
  const fetchTasks = useAppStore((s) => s.fetchTasks);
  const [open, setOpen] = useState(false);

  const selectedRepo = repos.find((r) => r.id === selectedRepoId);

  const handleSelect = (repoId: string) => {
    selectRepo(repoId);
    setOpen(false);
    // Fetch tasks for the newly selected repo
    setTimeout(() => fetchTasks(), 0);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="btn-secondary flex items-center gap-2 min-w-[140px]"
      >
        <svg className="h-4 w-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
        </svg>
        <span className="truncate text-sm">
          {selectedRepo ? selectedRepo.name : '选择仓库'}
        </span>
        <svg className={`h-4 w-4 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          {/* Dropdown */}
          <div className="absolute right-0 top-full z-40 mt-1 w-64 rounded-xl border border-slate-700 bg-slate-800 py-1 shadow-xl">
            {repos.length === 0 ? (
              <div className="px-3 py-2 text-sm text-slate-500">暂无仓库</div>
            ) : (
              repos.map((repo) => (
                <button
                  key={repo.id}
                  onClick={() => handleSelect(repo.id)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-slate-700/50 ${
                    repo.id === selectedRepoId ? 'text-brand-400 bg-brand-500/10' : 'text-slate-300'
                  }`}
                >
                  <span className="truncate font-medium">{repo.name}</span>
                  <span className="truncate text-xs text-slate-500">{repo.path}</span>
                  {repo.id === selectedRepoId && (
                    <svg className="ml-auto h-4 w-4 shrink-0 text-brand-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  )}
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
