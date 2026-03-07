import { query as sdkQuery } from '@anthropic-ai/claude-agent-sdk';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { createUserInteractionServer } from '../user-interaction.js';
import { buildPrompt, getSystemPromptAppend } from '../prompt-builder.js';
import { loadEnabledPlugins } from '../plugin-loader.js';
import type { AgentRunner, RunContext } from './types.js';

export const claudeRunner: AgentRunner = {
  async run(ctx: RunContext): Promise<{ result?: string; costUsd?: number }> {
    const { task, repo, abortController } = ctx;
    const taskLanguage = (task.language ?? 'zh') as 'zh' | 'en';

    const mcpServer = createUserInteractionServer(
      task.id, repo.id, task.interactionTimeout, taskLanguage, abortController.signal,
    );

    const prompt = buildPrompt(task, repo);

    const cleanEnv: Record<string, string | undefined> = { ...process.env };
    delete cleanEnv.CLAUDECODE;

    const plugins = loadEnabledPlugins();
    if (plugins.length > 0) {
      await ctx.logTask('info', `Loaded plugins: ${plugins.map(p => p.path.split('/').slice(-2).join('/')).join(', ')}`);
    }

    const conversation = sdkQuery({
      prompt,
      options: {
        cwd: repo.path,
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        settingSources: ['user', 'project'],
        systemPrompt: {
          type: 'preset',
          preset: 'claude_code',
          append: getSystemPromptAppend(taskLanguage),
        },
        tools: { type: 'preset', preset: 'claude_code' },
        thinking: task.thinkingEnabled
          ? { type: 'enabled', budgetTokens: 10000 }
          : { type: 'adaptive' },
        model: task.model,
        maxBudgetUsd: task.maxBudgetUsd,
        abortController,
        env: cleanEnv,
        plugins,
        mcpServers: {
          'user-interaction': mcpServer,
        },
      },
    });

    let finalResult: string | undefined;
    let finalCost: number | undefined;

    for await (const message of conversation) {
      if (abortController.signal.aborted) break;
      const outcome = await processClaudeMessage(ctx, message);
      if (outcome) {
        finalResult = outcome.result;
        finalCost = outcome.costUsd;
      }
    }

    return { result: finalResult, costUsd: finalCost };
  },
};

async function processClaudeMessage(
  ctx: RunContext,
  message: SDKMessage,
): Promise<{ result?: string; costUsd?: number } | null> {
  if (ctx.abortController.signal.aborted) return null;

  switch (message.type) {
    case 'assistant': {
      for (const block of message.message.content as any[]) {
        if (block.type === 'text') {
          const logText = block.text.length > 2000 ? block.text.slice(0, 2000) + '... (truncated)' : block.text;
          await ctx.logTask('info', logText);
        } else if (block.type === 'tool_use') {
          const inputStr = JSON.stringify(block.input);
          const truncInput = inputStr.length > 500 ? inputStr.slice(0, 500) + '...' : inputStr;
          await ctx.logTask('debug', `Tool: ${block.name} ${truncInput}`);
        }
      }
      return null;
    }
    case 'result': {
      const msg = message as any;
      if (msg.subtype === 'success') {
        await ctx.logTask('info', `Completed. Cost: $${msg.total_cost_usd?.toFixed(4) ?? '?'}, Turns: ${msg.num_turns}, Duration: ${(msg.duration_ms / 1000).toFixed(1)}s`);
        return { result: msg.result, costUsd: msg.total_cost_usd };
      } else {
        const errorMsg = 'errors' in msg && Array.isArray(msg.errors)
          ? msg.errors.join('; ')
          : `SDK error: ${msg.subtype}`;
        throw new Error(errorMsg);
      }
    }
    case 'system': {
      const msg = message as any;
      switch (msg.subtype) {
        case 'init':
          await ctx.logTask('debug', `SDK initialized. Model: ${msg.model}, Tools: ${msg.tools.length}, MCP: ${msg.mcp_servers?.map((s: any) => s.name).join(', ') || 'none'}`);
          break;
        case 'task_started':
          await ctx.logTask('debug', `Sub-agent started: ${msg.description}`);
          break;
        case 'task_progress':
          await ctx.logTask('debug', `Sub-agent progress: ${msg.description} (tokens: ${msg.usage?.total_tokens}, tools: ${msg.usage?.tool_uses})`);
          break;
        case 'task_notification':
          await ctx.logTask('debug', `Sub-agent ${msg.status}: ${msg.summary}`);
          break;
        case 'status':
          if (msg.status) await ctx.logTask('debug', `Status: ${msg.status}`);
          break;
      }
      return null;
    }
    case 'tool_progress': {
      const msg = message as any;
      await ctx.logTask('debug', `Tool progress: ${msg.tool_name} (${msg.elapsed_time_seconds}s)`);
      return null;
    }
    case 'tool_use_summary': {
      const msg = message as any;
      await ctx.logTask('debug', msg.summary);
      return null;
    }
    case 'auth_status': {
      const msg = message as any;
      if (msg.error) {
        await ctx.logTask('warn', `Auth error: ${msg.error}`);
      }
      return null;
    }
    case 'rate_limit_event': {
      const msg = message as any;
      const info = msg.rate_limit_info;
      if (info?.status === 'rejected') {
        const resetsIn = info.resetsAt ? `resets in ${Math.ceil((info.resetsAt - Date.now() / 1000) / 60)}min` : '';
        await ctx.logTask('warn', `Rate limited (${info.rateLimitType}). ${resetsIn}`);
      } else if (info?.status === 'allowed_warning') {
        await ctx.logTask('warn', `Rate limit warning: ${Math.round((info.utilization ?? 0) * 100)}% used (${info.rateLimitType})`);
      }
      return null;
    }
    default:
      return null;
  }
}
