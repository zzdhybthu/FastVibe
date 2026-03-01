import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const repos = sqliteTable('repos', {
  id: text('id').primaryKey(),
  path: text('path').notNull().unique(),
  name: text('name').notNull(),
  mainBranch: text('main_branch').notNull().default('main'),
  maxConcurrency: integer('max_concurrency').notNull().default(3),
  gitUser: text('git_user').notNull(),
  gitEmail: text('git_email').notNull(),
  createdAt: text('created_at').notNull(),
});

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  repoId: text('repo_id').notNull().references(() => repos.id),
  title: text('title'),
  prompt: text('prompt').notNull(),
  status: text('status').notNull().default('PENDING'),
  thinkingEnabled: integer('thinking_enabled', { mode: 'boolean' }).notNull().default(false),
  predecessorTaskId: text('predecessor_task_id'),
  model: text('model').notNull(),
  maxBudgetUsd: real('max_budget_usd').notNull(),
  interactionTimeout: integer('interaction_timeout').notNull(),
  branchName: text('branch_name'),
  worktreePath: text('worktree_path'),
  sessionId: text('session_id'),
  result: text('result'),
  errorMessage: text('error_message'),
  costUsd: real('cost_usd'),
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
  createdAt: text('created_at').notNull(),
});

export const taskInteractions = sqliteTable('task_interactions', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().references(() => tasks.id),
  questionData: text('question_data').notNull(),
  answerData: text('answer_data'),
  status: text('status').notNull().default('pending'),
  createdAt: text('created_at').notNull(),
  answeredAt: text('answered_at'),
});

export const taskLogs = sqliteTable('task_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  taskId: text('task_id').notNull().references(() => tasks.id),
  level: text('level').notNull().default('info'),
  message: text('message').notNull(),
  timestamp: text('timestamp').notNull(),
});
