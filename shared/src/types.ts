// Task statuses
export type TaskStatus =
  | 'PENDING'
  | 'QUEUED'
  | 'RUNNING'
  | 'AWAITING_INPUT'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type InteractionStatus = 'pending' | 'answered' | 'timeout';
export type LogLevel = 'info' | 'warn' | 'error' | 'debug';
export type AgentType = 'claude-code' | 'codex';

// --- DB row types ---

export interface Repo {
  id: string;
  path: string;
  name: string;
  mainBranch: string;
  maxConcurrency: number;
  createdAt: string;
}

export interface Task {
  id: string;
  repoId: string;
  title: string | null;
  prompt: string;
  status: TaskStatus;
  agentType: AgentType;
  thinkingEnabled: boolean;
  predecessorTaskId: string | null;
  model: string;
  maxBudgetUsd: number;
  interactionTimeout: number;
  language: 'zh' | 'en';
  branchName: string | null;
  worktreePath: string | null;
  sessionId: string | null;
  result: string | null;
  errorMessage: string | null;
  costUsd: number | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface TaskInteraction {
  id: string;
  taskId: string;
  questionData: string; // JSON
  answerData: string | null; // JSON
  status: InteractionStatus;
  createdAt: string;
  answeredAt: string | null;
}

export interface TaskLog {
  id: number;
  taskId: string;
  level: LogLevel;
  message: string;
  timestamp: string;
}

// --- API request/response types ---

export interface CreateRepoRequest {
  path: string;
  name: string;
  mainBranch?: string;
  maxConcurrency?: number;
}

export interface CreateTaskRequest {
  prompt: string;
  title?: string;
  thinkingEnabled?: boolean;
  predecessorTaskId?: string;
  model?: string;
  maxBudgetUsd?: number;
  interactionTimeout?: number;
  language?: 'zh' | 'en';
  agentType?: AgentType;
}

export interface AnswerInteractionRequest {
  answer: string;
}

// --- WebSocket event types ---

export type WsServerEvent =
  | { type: 'task:status'; taskId: string; repoId: string; status: TaskStatus; task: Task }
  | { type: 'task:log'; taskId: string; level: LogLevel; message: string; timestamp: string }
  | { type: 'task:interaction'; taskId: string; interactionId: string; questionData: unknown }
  | { type: 'ping' };

export type WsClientEvent =
  | { type: 'subscribe'; repoId: string }
  | { type: 'unsubscribe'; repoId: string }
  | { type: 'interaction:answer'; interactionId: string; answer: string };

// --- Config types ---

export interface AppConfig {
  server: {
    port: number;
    host: string;
    authToken: string;
  };
  global: {
    maxTotalConcurrency: number;
  };
  defaultAgent: AgentType;
  claude: {
    model: string[];
    maxBudgetUsd: number;
    interactionTimeout: number;
  };
  codex: {
    model: string[];
  };
}

export interface AgentDefaults {
  defaultAgent: AgentType;
  claude: {
    models: string[];
    defaultModel: string;
    maxBudgetUsd: number;
    interactionTimeout: number;
  };
  codex: {
    models: string[];
    defaultModel: string;
  };
}
