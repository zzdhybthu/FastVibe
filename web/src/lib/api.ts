import type {
  Repo,
  Task,
  CreateRepoRequest,
  CreateTaskRequest,
  TaskStatus,
  AppConfig,
  AgentDefaults,
} from '@fastvibe/shared';

const TOKEN_KEY = 'fastvibe_token';

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function getHeaders(hasBody?: boolean): HeadersInit {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (hasBody) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const hasBody = !!options?.body;
  const res = await fetch(path, {
    ...options,
    headers: {
      ...getHeaders(hasBody),
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }

  // 204 No Content
  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

// --- Repos ---

export function fetchRepos(): Promise<Repo[]> {
  return request<Repo[]>('/api/repos');
}

export function createRepo(data: CreateRepoRequest): Promise<Repo> {
  return request<Repo>('/api/repos', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateRepo(id: string, data: Partial<CreateRepoRequest>): Promise<Repo> {
  return request<Repo>(`/api/repos/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deleteRepo(id: string): Promise<void> {
  return request<void>(`/api/repos/${id}`, {
    method: 'DELETE',
  });
}

// --- Tasks ---

export function fetchTasks(repoId: string, status?: string): Promise<Task[]> {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  const qs = params.toString();
  return request<Task[]>(`/api/repos/${repoId}/tasks${qs ? `?${qs}` : ''}`);
}

export function createTask(repoId: string, data: CreateTaskRequest): Promise<Task> {
  return request<Task>(`/api/repos/${repoId}/tasks`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export interface TaskDetailResponse extends Task {
  logs: import('@fastvibe/shared').TaskLog[];
  interactions: import('@fastvibe/shared').TaskInteraction[];
}

export function fetchTaskDetail(taskId: string): Promise<TaskDetailResponse> {
  return request<TaskDetailResponse>(`/api/tasks/${taskId}`);
}

export function cancelTask(taskId: string): Promise<void> {
  return request<void>(`/api/tasks/${taskId}/cancel`, {
    method: 'POST',
  });
}

export function deleteTask(taskId: string): Promise<void> {
  return request<void>(`/api/tasks/${taskId}`, {
    method: 'DELETE',
  });
}

export interface RestartTaskOptions {
  prompt?: string;
  title?: string;
  model?: string;
  maxBudgetUsd?: number;
  interactionTimeout?: number;
  thinkingEnabled?: boolean;
  language?: 'zh' | 'en';
  agentType?: import('@fastvibe/shared').AgentType;
}

export function restartTask(taskId: string, overrides?: RestartTaskOptions): Promise<Task> {
  return request<Task>(`/api/tasks/${taskId}/restart`, {
    method: 'POST',
    body: overrides ? JSON.stringify(overrides) : undefined,
  });
}

export function bulkDeleteTasks(repoId: string, status: TaskStatus): Promise<void> {
  return request<void>(`/api/repos/${repoId}/tasks/bulk?status=${status}`, {
    method: 'DELETE',
  });
}

// --- Interactions ---

export function answerInteraction(interactionId: string, answer: string): Promise<void> {
  return request<void>(`/api/interactions/${interactionId}/answer`, {
    method: 'POST',
    body: JSON.stringify({ answer }),
  });
}

// --- Config ---

export function fetchAgentDefaults(): Promise<AgentDefaults> {
  return request<AgentDefaults>('/api/config/agent-defaults');
}

export function fetchConfig(): Promise<AppConfig> {
  return request<AppConfig>('/api/config');
}

export function updateConfig(data: Partial<AppConfig>): Promise<AppConfig> {
  return request<AppConfig>('/api/config', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}
