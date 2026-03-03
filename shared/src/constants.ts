import type { TaskStatus } from './types.js';

export const TERMINAL_STATUSES: readonly TaskStatus[] = ['COMPLETED', 'FAILED', 'CANCELLED'] as const;
export const DEFAULT_PORT = 8420;
export const DEFAULT_MAX_CONCURRENCY = 3;
export const DEFAULT_INTERACTION_TIMEOUT = 1800; // seconds
export const DEFAULT_MAX_BUDGET_USD = 5.0;
export const PROMPT_TITLE_MAX_LEN = 50;
