import { eventBus } from '../ws/event-bus.js';
import { getTaskQueue } from './task-queue.js';
import { runTask } from './task-runner.js';

export class Scheduler {
  private intervalId: NodeJS.Timeout | null = null;
  private running = false;

  start() {
    // Run processQueue every 2 seconds
    this.intervalId = setInterval(() => this.processQueue(), 2000);

    // Also listen to eventBus 'schedule:check' for immediate processing
    eventBus.on('schedule:check', () => this.processQueue());

    // Listen for task termination to check dependents
    eventBus.on('task:completed', (taskId: string) => this.onTaskTerminated(taskId));
    eventBus.on('task:failed', (taskId: string) => this.onTaskTerminated(taskId));
    eventBus.on('task:cancelled', (taskId: string) => this.onTaskTerminated(taskId));
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // Remove all listeners we added
    eventBus.removeAllListeners('schedule:check');
    eventBus.removeAllListeners('task:completed');
    eventBus.removeAllListeners('task:failed');
    eventBus.removeAllListeners('task:cancelled');
  }

  private async processQueue() {
    if (this.running) return; // prevent re-entrant
    this.running = true;
    try {
      const taskQueue = getTaskQueue();
      const tasksToRun = await taskQueue.getTasksToRun();
      for (const { task, repo } of tasksToRun) {
        // Fire and forget — don't await runTask
        runTask(task, repo).catch((err) => {
          console.error(`[scheduler] Task ${task.id} failed:`, err);
        });
      }
    } catch (err) {
      console.error('[scheduler] Error processing queue:', err);
    } finally {
      this.running = false;
    }
  }

  private async onTaskTerminated(taskId: string) {
    try {
      const taskQueue = getTaskQueue();
      await taskQueue.onTaskTerminated(taskId);
      // Immediately check queue for newly unblocked tasks
      await this.processQueue();
    } catch (err) {
      console.error(`[scheduler] Error handling task termination for ${taskId}:`, err);
    }
  }
}
