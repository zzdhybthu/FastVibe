import { create } from 'zustand';
import type {
  Repo,
  Task,
  TaskStatus,
  TaskLog,
  TaskInteraction,
  CreateRepoRequest,
  CreateTaskRequest,
  ClaudeDefaults,
} from '@vibecoding/shared';
import * as api from '../lib/api';
import type { TaskDetailResponse } from '../lib/api';

const TOKEN_KEY = 'vibecoding_token';

interface AppState {
  // Auth
  token: string | null;
  // Repos
  repos: Repo[];
  selectedRepoId: string | null;
  // Tasks
  tasks: Task[];
  selectedTaskId: string | null;
  taskDetail: TaskDetailResponse | null;
  // Interactions
  pendingInteractions: TaskInteraction[];
  // Claude defaults
  claudeDefaults: ClaudeDefaults | null;
  // UI
  loading: boolean;
  error: string | null;

  // Auth actions
  setToken: (token: string | null) => void;

  // Repo actions
  fetchRepos: () => Promise<void>;
  selectRepo: (repoId: string | null) => void;
  createRepo: (data: CreateRepoRequest) => Promise<Repo>;
  updateRepo: (id: string, data: Partial<CreateRepoRequest>) => Promise<void>;
  deleteRepo: (id: string) => Promise<void>;

  // Task actions
  fetchTasks: (status?: string) => Promise<void>;
  createTask: (data: CreateTaskRequest) => Promise<Task>;
  cancelTask: (taskId: string) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  bulkDelete: (status: TaskStatus) => Promise<void>;
  setSelectedTask: (taskId: string | null) => void;
  fetchTaskDetail: (taskId: string) => Promise<void>;

  // Interaction actions
  answerInteraction: (interactionId: string, answer: string) => Promise<void>;

  // Config actions
  fetchClaudeDefaults: () => Promise<void>;

  // WebSocket actions
  updateTaskFromWs: (task: Task) => void;
  addLogFromWs: (taskId: string, log: Omit<TaskLog, 'id' | 'taskId'>) => void;
  addInteractionFromWs: (taskId: string, interaction: Partial<TaskInteraction>) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  token: localStorage.getItem(TOKEN_KEY),
  repos: [],
  selectedRepoId: null,
  tasks: [],
  selectedTaskId: null,
  taskDetail: null,
  pendingInteractions: [],
  claudeDefaults: null,
  loading: false,
  error: null,

  // Auth
  setToken: (token) => {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
    set({ token, repos: [], tasks: [], selectedRepoId: null, selectedTaskId: null, taskDetail: null });
  },

  // Repos
  fetchRepos: async () => {
    try {
      set({ loading: true, error: null });
      const repos = await api.fetchRepos();
      set({ repos, loading: false });
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
      throw err;
    }
  },

  selectRepo: (repoId) => {
    set({ selectedRepoId: repoId, tasks: [], selectedTaskId: null, taskDetail: null });
  },

  createRepo: async (data) => {
    const repo = await api.createRepo(data);
    set((s) => ({ repos: [...s.repos, repo] }));
    return repo;
  },

  updateRepo: async (id, data) => {
    const updated = await api.updateRepo(id, data);
    set((s) => ({ repos: s.repos.map((r) => (r.id === id ? updated : r)) }));
  },

  deleteRepo: async (id) => {
    await api.deleteRepo(id);
    set((s) => ({
      repos: s.repos.filter((r) => r.id !== id),
      selectedRepoId: s.selectedRepoId === id ? null : s.selectedRepoId,
    }));
  },

  // Tasks
  fetchTasks: async (status) => {
    const { selectedRepoId } = get();
    if (!selectedRepoId) return;
    try {
      set({ loading: true, error: null });
      const tasks = await api.fetchTasks(selectedRepoId, status);
      set({ tasks, loading: false });
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  createTask: async (data) => {
    const { selectedRepoId } = get();
    if (!selectedRepoId) throw new Error('No repo selected');
    const task = await api.createTask(selectedRepoId, data);
    set((s) => ({ tasks: [task, ...s.tasks] }));
    return task;
  },

  cancelTask: async (taskId) => {
    await api.cancelTask(taskId);
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === taskId ? { ...t, status: 'CANCELLED' as TaskStatus } : t,
      ),
    }));
  },

  deleteTask: async (taskId) => {
    await api.deleteTask(taskId);
    set((s) => ({
      tasks: s.tasks.filter((t) => t.id !== taskId),
      selectedTaskId: s.selectedTaskId === taskId ? null : s.selectedTaskId,
      taskDetail: s.taskDetail?.id === taskId ? null : s.taskDetail,
    }));
  },

  bulkDelete: async (status) => {
    const { selectedRepoId } = get();
    if (!selectedRepoId) return;
    await api.bulkDeleteTasks(selectedRepoId, status);
    set((s) => ({
      tasks: s.tasks.filter((t) => t.status !== status),
    }));
  },

  setSelectedTask: (taskId) => {
    set({ selectedTaskId: taskId, taskDetail: null });
  },

  fetchTaskDetail: async (taskId) => {
    try {
      const detail = await api.fetchTaskDetail(taskId);
      set({ taskDetail: detail });
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  // Interactions
  answerInteraction: async (interactionId, answer) => {
    await api.answerInteraction(interactionId, answer);
    set((s) => ({
      pendingInteractions: s.pendingInteractions.filter((i) => i.id !== interactionId),
      taskDetail: s.taskDetail
        ? {
            ...s.taskDetail,
            interactions: s.taskDetail.interactions.map((i) =>
              i.id === interactionId
                ? { ...i, status: 'answered' as const, answerData: JSON.stringify(answer), answeredAt: new Date().toISOString() }
                : i,
            ),
          }
        : null,
    }));
  },

  // Config
  fetchClaudeDefaults: async () => {
    try {
      const defaults = await api.fetchClaudeDefaults();
      set({ claudeDefaults: defaults });
    } catch (err) {
      console.error('Failed to fetch claude defaults:', err);
    }
  },

  // WebSocket handlers
  updateTaskFromWs: (task) => {
    set((s) => {
      const tasks = s.tasks.map((t) => (t.id === task.id ? task : t));
      // If task is not in list and belongs to current repo, add it
      if (!tasks.find((t) => t.id === task.id) && task.repoId === s.selectedRepoId) {
        tasks.unshift(task);
      }
      const taskDetail =
        s.taskDetail?.id === task.id
          ? { ...s.taskDetail, ...task }
          : s.taskDetail;
      return { tasks, taskDetail };
    });
  },

  addLogFromWs: (taskId, log) => {
    set((s) => {
      if (s.taskDetail?.id !== taskId) return s;
      const newLog: TaskLog = {
        id: Date.now(),
        taskId,
        level: log.level,
        message: log.message,
        timestamp: log.timestamp,
      };
      return {
        taskDetail: {
          ...s.taskDetail,
          logs: [...s.taskDetail.logs, newLog],
        },
      };
    });
  },

  addInteractionFromWs: (taskId, interaction) => {
    set((s) => {
      const newInteraction: TaskInteraction = {
        id: interaction.id || '',
        taskId,
        questionData: typeof interaction.questionData === 'string'
          ? interaction.questionData
          : JSON.stringify(interaction.questionData),
        answerData: null,
        status: 'pending',
        createdAt: new Date().toISOString(),
        answeredAt: null,
      };

      const pendingInteractions = [...s.pendingInteractions, newInteraction];

      const taskDetail =
        s.taskDetail?.id === taskId
          ? {
              ...s.taskDetail,
              interactions: [...s.taskDetail.interactions, newInteraction],
            }
          : s.taskDetail;

      // Update task status to AWAITING_INPUT
      const tasks = s.tasks.map((t) =>
        t.id === taskId ? { ...t, status: 'AWAITING_INPUT' as TaskStatus } : t,
      );

      return { pendingInteractions, taskDetail, tasks };
    });
  },
}));
