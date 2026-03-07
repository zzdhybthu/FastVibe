import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface PluginConfig {
  type: 'local';
  path: string;
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
 * Load enabled plugins from user settings and installed_plugins.json.
 *
 * Cross-references ~/.claude/settings.json `enabledPlugins` with
 * ~/.claude/plugins/installed_plugins.json to resolve install paths.
 */
export function loadEnabledPlugins(): PluginConfig[] {
  const claudeDir = join(homedir(), '.claude');

  const settings = readJsonFile(join(claudeDir, 'settings.json'));
  const enabledPlugins: Record<string, boolean> = settings?.enabledPlugins ?? {};

  const installedData = readJsonFile(join(claudeDir, 'plugins', 'installed_plugins.json'));
  const installedPlugins: Record<string, Array<{ installPath: string }>> = installedData?.plugins ?? {};

  const plugins: PluginConfig[] = [];

  for (const [pluginId, enabled] of Object.entries(enabledPlugins)) {
    if (!enabled) continue;

    const installations = installedPlugins[pluginId];
    if (!installations || installations.length === 0) continue;

    const installPath = installations[0].installPath;
    if (installPath && existsSync(installPath)) {
      plugins.push({ type: 'local', path: installPath });
    }
  }

  return plugins;
}
