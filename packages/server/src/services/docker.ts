import Docker from 'dockerode';
import { homedir } from 'node:os';
import type { AppConfig } from '@vibecoding/shared';

const docker = new Docker();

/**
 * Expand ~ in bind mount paths to the actual home directory.
 */
function expandHome(path: string): string {
  if (path.startsWith('~/') || path === '~') {
    return path.replace('~', homedir());
  }
  return path;
}

/**
 * Expand ~ in bind mount specs (format: "hostPath:containerPath[:options]").
 */
function expandBindHome(bind: string): string {
  const parts = bind.split(':');
  if (parts.length >= 2) {
    parts[0] = expandHome(parts[0]);
    return parts.join(':');
  }
  return expandHome(bind);
}

/**
 * Create a Docker container for a worker task.
 * The container runs `sleep infinity` to stay alive while CC operates inside it.
 *
 * @returns container ID
 */
export async function createWorkerContainer(
  taskId: string,
  repoPath: string,
  config: AppConfig,
): Promise<string> {
  // Build bind mounts: repo path + extra binds from config
  const binds = [
    `${repoPath}:${repoPath}`,
    ...config.docker.binds.map(expandBindHome),
  ];

  // Build environment variables
  const env: string[] = [
    'HOME=/root',  // docker exec non-interactive may not set HOME
  ];
  if (process.env.ANTHROPIC_API_KEY) {
    env.push(`ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY}`);
  }
  if (process.env.ANTHROPIC_BASE_URL) {
    env.push(`ANTHROPIC_BASE_URL=${process.env.ANTHROPIC_BASE_URL}`);
  }

  // SSH Agent forwarding (host socket path is dynamic)
  const sshAuthSock = process.env.SSH_AUTH_SOCK;
  if (sshAuthSock) {
    binds.push(`${sshAuthSock}:/tmp/ssh-agent.sock`);
    env.push('SSH_AUTH_SOCK=/tmp/ssh-agent.sock');
  }

  // Plugin path compatibility: installed_plugins.json references ${hostHome}/.claude/...
  // Mount to the same path inside the container so absolute paths resolve correctly
  const hostHome = homedir();
  if (hostHome !== '/root') {
    binds.push(`${hostHome}/.claude:${hostHome}/.claude:ro`);
  }

  const container = await docker.createContainer({
    Image: config.docker.image,
    Cmd: ['sleep', 'infinity'],
    WorkingDir: repoPath,
    Labels: {
      'vibecoding.task-id': taskId,
    },
    Env: env,
    HostConfig: {
      Binds: binds,
      NetworkMode: config.docker.networkMode || 'host',
    },
  });

  await container.start();
  return container.id;
}

/**
 * Remove a Docker container by ID.
 * Handles the case where the container does not exist gracefully.
 */
export async function removeContainer(containerId: string): Promise<void> {
  try {
    const container = docker.getContainer(containerId);
    try {
      await container.stop({ t: 5 });
    } catch (err: any) {
      // Container might already be stopped — ignore 304 (not modified) or 404
      if (err.statusCode !== 304 && err.statusCode !== 404) {
        console.warn(`[docker] Warning stopping container ${containerId}:`, err.message);
      }
    }
    await container.remove({ force: true });
  } catch (err: any) {
    // Container not found is OK
    if (err.statusCode !== 404) {
      console.error(`[docker] Error removing container ${containerId}:`, err.message);
    }
  }
}

/**
 * Clean up orphan containers labeled with vibecoding.task-id.
 * Returns the count of containers removed.
 */
export async function cleanupOrphanContainers(): Promise<number> {
  let removed = 0;
  try {
    const containers = await docker.listContainers({
      all: true,
      filters: {
        label: ['vibecoding.task-id'],
      },
    });

    for (const containerInfo of containers) {
      try {
        const container = docker.getContainer(containerInfo.Id);
        if (containerInfo.State === 'running') {
          await container.stop({ t: 5 }).catch(() => {});
        }
        await container.remove({ force: true });
        removed++;
        console.log(`[docker] Removed orphan container ${containerInfo.Id.slice(0, 12)} (task: ${containerInfo.Labels['vibecoding.task-id']})`);
      } catch (err: any) {
        if (err.statusCode !== 404) {
          console.warn(`[docker] Failed to remove orphan container ${containerInfo.Id.slice(0, 12)}:`, err.message);
        }
      }
    }
  } catch (err) {
    console.error('[docker] Error listing containers for cleanup:', err);
  }

  return removed;
}

/**
 * Check if a container is currently running.
 */
export async function isContainerRunning(containerId: string): Promise<boolean> {
  try {
    const container = docker.getContainer(containerId);
    const info = await container.inspect();
    return info.State.Running === true;
  } catch (err: any) {
    // Container not found
    if (err.statusCode === 404) {
      return false;
    }
    throw err;
  }
}
