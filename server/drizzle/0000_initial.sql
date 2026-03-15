CREATE TABLE `repos` (
	`id` text PRIMARY KEY NOT NULL,
	`path` text NOT NULL,
	`name` text NOT NULL,
	`main_branch` text DEFAULT 'main' NOT NULL,
	`max_concurrency` integer DEFAULT 3 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `repos_path_unique` ON `repos` (`path`);--> statement-breakpoint
CREATE TABLE `task_interactions` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`question_data` text NOT NULL,
	`answer_data` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`answered_at` text,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `task_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_id` text NOT NULL,
	`level` text DEFAULT 'info' NOT NULL,
	`message` text NOT NULL,
	`timestamp` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`repo_id` text NOT NULL,
	`title` text,
	`prompt` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`agent_type` text DEFAULT 'claude-code' NOT NULL,
	`thinking_enabled` integer DEFAULT false NOT NULL,
	`continue_session` integer DEFAULT false NOT NULL,
	`predecessor_task_id` text,
	`model` text NOT NULL,
	`max_budget_usd` real NOT NULL,
	`interaction_timeout` integer NOT NULL,
	`language` text DEFAULT 'zh' NOT NULL,
	`branch_name` text,
	`worktree_path` text,
	`session_id` text,
	`result` text,
	`error_message` text,
	`cost_usd` real,
	`started_at` text,
	`completed_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`repo_id`) REFERENCES `repos`(`id`) ON UPDATE no action ON DELETE no action
);
