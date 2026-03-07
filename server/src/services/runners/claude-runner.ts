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
      if (message.subtype === 'success') {
        return { result: message.result, costUsd: message.total_cost_usd };
      } else {
        const errorMsg = 'errors' in message && Array.isArray(message.errors)
          ? message.errors.join('; ')
          : `SDK error: ${message.subtype}`;
        throw new Error(errorMsg);
      }
    }
    case 'system': {
      if (message.subtype === 'init') {
        await ctx.logTask('debug', `SDK initialized. Model: ${message.model}, Tools: ${message.tools.length}`);
      } else if (message.subtype === 'task_started') {
        await ctx.logTask('debug', `Sub-agent started: ${message.description}`);
      } else if (message.subtype === 'task_notification') {
        await ctx.logTask('debug', `Sub-agent ${message.status}: ${message.summary}`);
      }
      return null;
    }
    case 'tool_use_summary': {
      await ctx.logTask('debug', message.summary);
      return null;
    }
    default:
      return null;
  }
}
