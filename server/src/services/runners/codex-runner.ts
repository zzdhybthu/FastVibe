import { Codex } from '@openai/codex-sdk';
import { buildPrompt } from '../prompt-builder.js';
import type { AgentRunner, RunContext } from './types.js';

export const codexRunner: AgentRunner = {
  async run(ctx: RunContext): Promise<{ result?: string; costUsd?: number }> {
    const { task, repo, abortController } = ctx;

    await ctx.logTask('info', `Starting Codex agent with model: ${task.model}`);

    const codex = new Codex({
      config: {
        model: task.model,
        approval_policy: 'never',
      },
    });

    const thread = codex.startThread({
      workingDirectory: repo.path,
    });

    const prompt = buildPrompt(task, repo);

    const { events } = await thread.runStreamed(prompt);

    let finalResponse: string | undefined;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for await (const event of events) {
      if (abortController.signal.aborted) break;

      switch (event.type) {
        case 'item.completed': {
          const item = event.item;
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
            const paths = item.changes.map(c => c.path).join(', ');
            await ctx.logTask('debug', `File changed: ${paths || 'unknown'}`);
          }
          break;
        }
        case 'turn.completed': {
          if (event.usage) {
            totalInputTokens += event.usage.input_tokens || 0;
            totalOutputTokens += event.usage.output_tokens || 0;
            await ctx.logTask('info', `Turn completed. Tokens: ${event.usage.input_tokens} in / ${event.usage.output_tokens} out`);
          }
          break;
        }
      }
    }

    return { result: finalResponse };
  },
};
