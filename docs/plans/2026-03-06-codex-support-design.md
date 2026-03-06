# Codex Support Design

## Goal

Support OpenAI Codex as an alternative code agent alongside Claude Code. Users can set a default agent in config and choose per-task at creation time.

## Data Model Changes

### New type: `AgentType = 'claude-code' | 'codex'`

### `tasks` table: add `agentType` column (text, default `'claude-code'`)

### `AppConfig`: add `defaultAgent: AgentType` and `codex: { model: string[] }`

### `ClaudeDefaults` → `AgentDefaults`: return both agent model lists + default agent

## Backend Architecture

### Runner abstraction (`server/src/services/runners/`)

- `types.ts` — `RunContext` type and `AgentRunner` interface
- `claude-runner.ts` — extracted from current `task-runner.ts`
- `codex-runner.ts` — uses `@openai/codex-sdk`

### `task-runner.ts` becomes a dispatcher

Selects runner based on `task.agentType`, delegates `run()`.

### Codex specifics

- Uses `@openai/codex-sdk` TypeScript SDK
- `sandboxMode: 'danger-full-access'`, `approvalPolicy: 'never'` (full-auto)
- No user interaction support (Codex SDK lacks in-process MCP server injection)
- External MCP servers loaded from repo settings via `config.mcp_servers`
- Streaming events mapped to existing `logTask()` / `broadcastTaskStatus()`

## Frontend Changes

- **ConfigPanel**: "Default Agent" dropdown
- **TaskForm**: "Agent" selector, dynamically switches model list
- **API**: `/api/config/agent-defaults` replaces `/api/config/claude-defaults`

## Limitations

- Codex tasks run in full-auto mode — no user interaction (ask_user) support
- README must document this limitation
