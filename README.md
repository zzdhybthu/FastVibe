<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/banner-dark.svg" />
    <source media="(prefers-color-scheme: light)" srcset="assets/banner-light.svg" />
    <img src="assets/banner-light.svg" alt="FastVibe" width="800" />
  </picture>
</p>

<p align="center">
  <a href="#tech-stack"><img src="https://img.shields.io/badge/Node.js-%3E%3D22-339933?logo=node.js&logoColor=white" alt="Node.js" /></a>
  <a href="#tech-stack"><img src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white" alt="TypeScript" /></a>
  <a href="#tech-stack"><img src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black" alt="React" /></a>
  <a href="#tech-stack"><img src="https://img.shields.io/badge/Code_Agent-6366f1?logo=anthropic&logoColor=white" alt="Code Agent" /></a>
  <a href="#tech-stack"><img src="https://img.shields.io/badge/pnpm-workspace-F69220?logo=pnpm&logoColor=white" alt="pnpm" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
</p>

<p align="center">
  A lightweight Code Agent orchestration hub with multi-repo management, task queuing, Git worktree automation, and real-time Web UI interaction.
</p>

<p align="center">
  <a href="README.zh.md">中文</a> | English
</p>

## Features

- **Multi-Repo Management**: Register multiple development repositories with independent configuration and isolation
- **Task Queue**: Priority queuing, concurrency control, and predecessor task dependencies
- **Parallel Execution**: Multiple atomic tasks run simultaneously without interference
- **Git Worktree**: Automatic worktree creation, branching, merging, and pushing
- **Real-Time Monitoring**: WebSocket-based task status and log streaming
- **User Interaction**: Code Agent can ask questions; users respond via the Web UI
- **Voice Input**: Web UI supports voice input, ideal for mobile scenarios
- **Fault Recovery**: Automatic task state recovery after service restart

> **Note**: Currently only [Claude Code](https://docs.anthropic.com/en/docs/claude-code) is supported as the backend agent. To support other Code Agents (e.g. Codex), you can extend the agent integration layer yourself.

## Use Cases

- **Desktop**: Kanban-style collaboration, monitoring Agent progress
- **Mobile**: Flexible development, notify your Agent anytime, anywhere

## Design Philosophy

> Atomize instructions · parallelize tasks · automate workflows · minimize intervention · maximize flexibility.

An Agent can design the overall project framework based on instructions, but fulfilling all requirements at once is unrealistic — your prompt can never cover every detail in a single shot. Without clear instructions, the Agent improvises: sometimes cutting corners, sometimes over-engineering, sometimes getting things wrong. When multiple requirements are mixed together, the Agent may lose focus, and issues become hard to pinpoint.

The right approach: **Build the framework first, then iterate step by step, giving one clear instruction at a time.** This is not inefficient — FastVibe's task parallelization lets these atomic tasks progress simultaneously and methodically.

## Recommended Workflow

### Step 1: Scaffold the Project

Use Code Agent to create a new project directly:

1. Initialize the project directory, configure git and remote
2. Think through what you want to build, write a detailed instruction set, and set up Claude's project configuration (system prompts, skills, etc.)
3. Use the best model + plan mode to have the Agent scaffold the overall project framework and implement initial functionality

### Step 2: Customize the Agent Workflow (Optional)

- Modify `server/src/services/prompt-builder.ts` — this defines the Agent's system prompt; adjusting it directly changes the Agent's behavior
- Fork this project and use FastVibe to improve FastVibe, customizing your orchestration hub
- If the existing architecture doesn't meet your needs, build your own orchestration system from scratch

### Step 3: Atomic Iteration

Add your project to FastVibe's working directory and start submitting atomic tasks:

- Each task does one thing: fix a bug, add a feature, tweak a style
- Multiple tasks can execute in parallel without blocking each other
- When tasks have dependencies, chain them using predecessor tasks

## Project Structure

```
server/            # Backend (Fastify + Claude Agent SDK + Drizzle ORM/SQLite)
web/               # Frontend (React 18 + Vite + Zustand + TailwindCSS)
shared/            # Shared types
config.yaml        # Runtime configuration
```

## Tech Stack

- **Backend**: Node.js (>=22) + Fastify + Claude Agent SDK + Drizzle ORM (SQLite)
- **Frontend**: React 18 + TypeScript + Vite + Zustand + TailwindCSS
- **Communication**: WebSocket (ws) + REST API
- **Build**: pnpm workspace monorepo

## Prerequisites

### 1. Install Node.js (>= 22)

Recommended: use [fnm](https://github.com/Schniz/fnm) for Node.js version management:

```bash
# Install fnm
curl -fsSL https://fnm.vercel.app/install | bash

# Reload shell config (or restart terminal)
source ~/.bashrc  # or source ~/.zshrc

# Install and use Node.js 22
fnm install 22
fnm use 22

# Verify
node -v  # Should output v22.x.x
```

### 2. Enable pnpm

Node.js 22 ships with corepack — just enable it:

```bash
corepack enable
corepack prepare pnpm@latest --activate

# Verify
pnpm -v
```

### 3. Install and Configure Code Agent CLI

```bash
# Install
curl -fsSL https://claude.ai/install.sh | bash

# Verify
claude --version
```

Log in or configure user-level settings (`~/.claude/settings.json`):

```json
{
  "env": {
    "ANTHROPIC_API_KEY": "sk-ant-..."
  },
  "skipDangerousModePermissionPrompt": true
}
```

Make sure `claude --dangerously-skip-permissions` works.

## Quick Start

```bash
pnpm install        # Install dependencies
```

Edit `config.yaml` to set `server.authToken` and other parameters. Repositories are managed through the Web UI.

### Development Mode

Frontend and backend run separately with hot reload:

```bash
pnpm dev            # Start backend (tsx watch, :8420)
pnpm dev:web        # Start frontend (Vite dev server, :5173)
```

Vite automatically proxies `/api/*` and `/ws` to the backend at `:8420` — no manual CORS handling needed. Both services must be started separately.

### Production Mode

Single-port deployment — the backend serves the frontend static files:

```bash
pnpm build          # Build all packages (shared + server + web)
pnpm start          # Start production server (:8420)
```

After building, the backend automatically detects `web/dist/` and mounts it as static assets. Access `:8420` for both API and frontend.

### Other Commands

```bash
pnpm -r typecheck   # TypeScript type checking
pnpm test           # Run tests
pnpm clean          # Clean build artifacts (dist/)
pnpm clean:db       # Clear database (server/data/)
pnpm clean:all      # Clean build artifacts + dependencies (dist/ + node_modules/)
```

## Configuration

```yaml
server:
  port: 8420              # Server port
  host: '0.0.0.0'         # Listen address
  authToken: 'xxx'        # Bearer Token

global:
  maxTotalConcurrency: 5  # Max total concurrency

claude:
  model:                  # Available models
    - 'claude-opus-4-6'
    - 'claude-sonnet-4-6'
  maxBudgetUsd: 1000.0    # Budget limit
  interactionTimeout: 86400  # User confirmation timeout (seconds)
```

You can also specify the config file path via the `CONFIG_PATH` environment variable.

## Browser Access

> Chrome is recommended.

### Local Access

After starting the server, open `http://localhost:8420` in your browser.

### Remote Server Access

If FastVibe is running on a remote server, use SSH port forwarding:

```bash
ssh -Nfn -L 8420:localhost:8420 user@your-server-ip
```

Then open `http://localhost:8420` in your local browser.

### Mobile Access

Mobile devices can also use SSH port forwarding. For example, with [Termux](https://termux.dev) (Android):

1. After installing Termux, run the same SSH port forwarding command
2. Enable **wakelock** (`termux-wake-lock`) to prevent Termux from being suspended in the background
3. Some phones require changing Termux from "Auto-manage" to "Manual" in **Settings > App Launch Management** to allow background execution
4. Open `http://localhost:8420` in the mobile browser — you can **add to home screen** for a standalone app experience (PWA)

### Voice Input

The Web UI supports voice input. On first use, the browser will request microphone permission — please allow it.

## Security Recommendations

This project runs Code Agent in dangerous mode by default — the Agent has full file read/write and command execution privileges. Recommendations:

- Use an isolated development environment
- Avoid running as root
- Regularly back up important data not managed by git

## References

- [胡渊鸣 | 我给 10 个 Claude Code 打工](https://mp.weixin.qq.com/s/9qPD3gXj3HLmrKC64Q6fbQ)

## License

[MIT](LICENSE)
