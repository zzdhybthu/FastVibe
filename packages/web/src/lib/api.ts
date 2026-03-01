import type {
  Repo,
  Task,
  CreateRepoRequest,
  CreateTaskRequest,
  TaskStatus,
  AppConfig,
  ClaudeDefaults,
} from '@vibecoding/shared';

const TOKEN_KEY = 'vibecoding_token';

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function getHeaders(): HeadersInit {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: {
      ...getHeaders(),
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
  logs: import('@vibecoding/shared').TaskLog[];
  interactions: import('@vibecoding/shared').TaskInteraction[];
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

export function fetchClaudeDefaults(): Promise<ClaudeDefaults> {
  return request<ClaudeDefaults>('/api/config/claude-defaults');
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
