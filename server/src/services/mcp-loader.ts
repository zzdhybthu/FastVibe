import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';

/**
 * Stdio-based MCP server config (from .mcp.json / settings.json).
 */
interface StdioMcpConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  type?: 'stdio';
}

/**
 * SSE-based MCP server config.
 */
interface SseMcpConfig {
  type: 'sse';
  url: string;
  headers?: Record<string, string>;
}

export type ExternalMcpConfig = StdioMcpConfig | SseMcpConfig;

/**
 * Expand `${VAR}` references in string values using process.env.
 */
function expandEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_match, varName) => {
    return process.env[varName] ?? '';
  });
}

/**
 * Recursively expand env vars in all string values of an MCP config.
 */
function expandConfigEnv(config: ExternalMcpConfig): ExternalMcpConfig {
  const result = { ...config };

  if ('command' in result && result.command) {
    result.command = expandEnvVars(result.command);
  }
  if ('args' in result && result.args) {
    result.args = result.args.map(expandEnvVars);
  }
  if ('url' in result && result.url) {
    (result as SseMcpConfig).url = expandEnvVars(result.url);
  }

  // Expand env values in the env or headers object
  const envLikeKey = 'env' in result ? 'env' : 'headers' in result ? 'headers' : null;
  if (envLikeKey && (result as any)[envLikeKey]) {
    const expanded: Record<string, string> = {};
    for (const [k, v] of Object.entries((result as any)[envLikeKey] as Record<string, string>)) {
      expanded[k] = expandEnvVars(v);
    }
    (result as any)[envLikeKey] = expanded;
  }

  return result;
}

/**
 * Safely read and parse a JSON file, returning null on failure.
 */
function readJsonFile(filePath: string): any {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Extract mcpServers from a parsed JSON object.
 * Supports both `.mcp.json` format and `settings.json` format.
 */
function extractMcpServers(data: any): Record<string, ExternalMcpConfig> {
  if (!data || typeof data !== 'object') return {};

  // Both formats use `mcpServers` key
  if (data.mcpServers && typeof data.mcpServers === 'object') {
    return data.mcpServers;
  }
  return {};
}

/**
 * Load external MCP server configs from all relevant sources for a given repo.
 *
 * Precedence (later overrides earlier):
 *   1. <repoPath>/.mcp.json
 *   2. ~/.claude/settings.json          (user)
 *   3. <repoPath>/.claude/settings.json (project)
 *   4. <repoPath>/.claude/settings.local.json (local)
 *
 * All `${VAR}` references in config values are expanded from process.env.
 */
export function loadExternalMcpServers(repoPath: string): Record<string, ExternalMcpConfig> {
  const sources = [
    resolve(repoPath, '.mcp.json'),
    join(homedir(), '.claude', 'settings.json'),
    resolve(repoPath, '.claude', 'settings.json'),
    resolve(repoPath, '.claude', 'settings.local.json'),
  ];

  const merged: Record<string, ExternalMcpConfig> = {};

  for (const filePath of sources) {
    const data = readJsonFile(filePath);
    const servers = extractMcpServers(data);
    for (const [name, config] of Object.entries(servers)) {
      merged[name] = expandConfigEnv(config);
    }
  }

  return merged;
}
