import { Codex } from '@openai/codex-sdk';
import { buildPrompt } from '../prompt-builder.js';
import type { AgentRunner, RunContext } from './types.js';

export const codexRunner: AgentRunner = {
  async run(ctx: RunContext): Promise<{ result?: string; costUsd?: number }> {
    const { task, repo, abortController } = ctx;

    await ctx.logTask('info', `Starting Codex agent. Model: ${task.model}, Thinking: ${task.thinkingEnabled}`);

    // Clean environment variables (aligned with Claude runner)
    const cleanEnv: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (v !== undefined && k !== 'CLAUDECODE') {
        cleanEnv[k] = v;
      }
    }

    const codex = new Codex({
      env: cleanEnv,
      config: {
        model: task.model,
        approval_policy: 'never',
      },
    });

    const thread = codex.startThread({
      workingDirectory: repo.path,
      modelReasoningEffort: task.thinkingEnabled ? 'high' : undefined,
      sandboxMode: 'danger-full-access',
    });

    const prompt = buildPrompt(task, repo);

    const { events } = await thread.runStreamed(prompt, {
      signal: abortController.signal,
    });

    let finalResponse: string | undefined;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for await (const event of events) {
      if (abortController.signal.aborted) break;

      switch (event.type) {
        case 'thread.started': {
          await ctx.logTask('debug', 'Thread started');
          break;
        }
        case 'turn.started': {
          await ctx.logTask('debug', 'Turn started');
          break;
        }
        case 'item.started': {
          const item = (event as any).item;
          if (item.type === 'command_execution') {
            await ctx.logTask('debug', `Running: $ ${item.command || ''}`);
          } else if (item.type === 'mcp_tool_call') {
            await ctx.logTask('debug', `MCP calling: ${item.server}/${item.tool}`);
          } else if (item.type === 'web_search') {
            await ctx.logTask('debug', `Web search: ${item.query || ''}`);
          }
          break;
        }
        case 'item.completed': {
          const item = (event as any).item;
          if (item.type === 'agent_message') {
            const text = item.text;
            if (text) {
              const logText = text.length > 2000 ? text.slice(0, 2000) + '... (truncated)' : text;
              await ctx.logTask('info', logText);
              finalResponse = text;
            }
          } else if (item.type === 'command_execution') {
            const cmd = item.command || '';
            const output = item.aggregated_output || '';
            await ctx.logTask('debug', `$ ${cmd}\n${output.length > 1000 ? output.slice(0, 1000) + '...' : output}`);
          } else if (item.type === 'file_change') {
            const paths = item.changes?.map((c: any) => c.path).join(', ');
            await ctx.logTask('debug', `File changed: ${paths || 'unknown'}`);
          } else if (item.type === 'reasoning') {
            await ctx.logTask('debug', `Reasoning: ${item.text?.length > 500 ? item.text.slice(0, 500) + '...' : item.text}`);
          } else if (item.type === 'mcp_tool_call') {
            await ctx.logTask('debug', `MCP: ${item.server}/${item.tool} → ${item.status}`);
          } else if (item.type === 'web_search') {
            await ctx.logTask('debug', `Web search completed: ${item.query || ''}`);
          } else if (item.type === 'todo_list') {
            const todos = item.items?.map((t: any) => `[${t.completed ? 'x' : ' '}] ${t.text}`).join('\n') || '';
            await ctx.logTask('debug', `Todo list:\n${todos}`);
          } else if (item.type === 'error') {
            await ctx.logTask('warn', `Item error: ${item.message || JSON.stringify(item)}`);
          }
          break;
        }
        case 'turn.completed': {
          const ev = event as any;
          if (ev.usage) {
            totalInputTokens += ev.usage.input_tokens || 0;
            totalOutputTokens += ev.usage.output_tokens || 0;
            await ctx.logTask('info', `Turn completed. Tokens: ${ev.usage.input_tokens} in / ${ev.usage.output_tokens} out`);
          }
          break;
        }
        case 'turn.failed': {
          throw new Error((event as any).error?.message || 'Turn failed');
        }
        case 'error': {
          throw new Error((event as any).message || 'Unknown error');
        }
      }
    }

    await ctx.logTask('info', `Codex completed. Total tokens: ${totalInputTokens} in / ${totalOutputTokens} out`);

    return { result: finalResponse, costUsd: undefined };
  },
};
