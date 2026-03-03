import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../stores/app-store';
import { useT } from '../i18n';
import Header from '../components/Header';
import TaskList from '../components/TaskList';
import TaskDetail from '../components/TaskDetail';
import TaskForm from '../components/TaskForm';
import ConfigPanel from '../components/ConfigPanel';
import RestartDialog from '../components/RestartDialog';
import ConfirmDialog from '../components/ConfirmDialog';

export default function Dashboard() {
  const fetchRepos = useAppStore((s) => s.fetchRepos);
  const selectedRepoId = useAppStore((s) => s.selectedRepoId);
  const repos = useAppStore((s) => s.repos);
  const selectRepo = useAppStore((s) => s.selectRepo);
  const fetchTasks = useAppStore((s) => s.fetchTasks);
  const selectedTaskId = useAppStore((s) => s.selectedTaskId);
  const setSelectedTask = useAppStore((s) => s.setSelectedTask);
  const t = useT();

  const [showConfig, setShowConfig] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);

  // Close detail panel when clicking outside
  useEffect(() => {
    if (!selectedTaskId) return;
    const handler = (e: MouseEvent) => {
      // Click inside the detail panel — keep open
      if (detailRef.current?.contains(e.target as Node)) return;
      // Click on a task card — will switch task, don't close
      if ((e.target as Element).closest?.('[data-task-card]')) return;
      // Click inside a modal overlay (z-50+) — ignore
      if ((e.target as Element).closest?.('[class*="fixed inset-0 z-"]')) return;
      setSelectedTask(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [selectedTaskId, setSelectedTask]);

  // Fetch repos on mount
  useEffect(() => {
    fetchRepos().then(() => {
      // Auto-select first repo if none selected
      const state = useAppStore.getState();
      if (!state.selectedRepoId && state.repos.length > 0) {
        selectRepo(state.repos[0].id);
      }
    });
  }, [fetchRepos, selectRepo]);

  // Fetch tasks when repo changes
  useEffect(() => {
    if (selectedRepoId) {
      fetchTasks();
    }
  }, [selectedRepoId, fetchTasks]);

  // Poll tasks periodically
  useEffect(() => {
    if (!selectedRepoId) return;
    const interval = setInterval(() => {
      fetchTasks();
    }, 10000);
    return () => clearInterval(interval);
  }, [selectedRepoId, fetchTasks]);

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        onOpenConfig={() => setShowConfig(true)}
        onOpenTaskForm={() => setShowTaskForm(true)}
      />

      <main className="mx-auto flex w-full max-w-7xl flex-1 min-h-0 gap-4 p-4">
        {/* Main content area — always rendered to preserve scroll */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          {!selectedRepoId ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <svg className="h-16 w-16 text-ink-faint mb-4" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
              </svg>
              <h2 className="text-lg font-medium text-ink-muted">
                {repos.length === 0 ? t.dashboard.noRepos : t.dashboard.selectRepo}
              </h2>
              <p className="mt-1 text-sm text-ink-hint">
                {repos.length === 0
                  ? t.dashboard.addRepoFirst
                  : t.dashboard.selectFromDropdown}
              </p>
              {repos.length === 0 && (
                <button
                  onClick={() => setShowConfig(true)}
                  className="btn-primary mt-4"
                >
                  {t.dashboard.openSettings}
                </button>
              )}
            </div>
          ) : (
            <TaskList onOpenTaskForm={() => setShowTaskForm(true)} />
          )}
        </div>

        {/* Task detail — mobile: fixed overlay, desktop: side panel */}
        {selectedTaskId && (
          <div
            ref={detailRef}
            className="fixed inset-0 z-30 overflow-y-auto bg-th-page p-4 md:static md:inset-auto md:z-auto md:overflow-visible md:bg-transparent md:p-0 md:w-[480px] lg:w-[560px] md:shrink-0"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setSelectedTask(null);
            }}
          >
            <TaskDetail onClose={() => setSelectedTask(null)} />
          </div>
        )}
      </main>

      {/* Modals */}
      {showTaskForm && (
        <TaskForm onClose={() => setShowTaskForm(false)} />
      )}
      {showConfig && (
        <ConfigPanel onClose={() => setShowConfig(false)} />
      )}
      <RestartDialog />
      <ConfirmDialog />
    </div>
  );
}
