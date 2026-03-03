import { EventEmitter } from 'node:events';

/**
 * Typed EventBus singleton for broadcasting events across the server.
 *
 * Event types:
 * - 'ws:broadcast'        — (event: WsServerEvent) broadcasts to subscribed WebSocket clients
 * - 'interaction:answered' — (interactionId: string, answer: string) resumes task runner
 * - 'task:completed'       — (taskId: string) notifies task queue to check dependents
 * - 'task:failed'          — (taskId: string) notifies task queue to check dependents
 * - 'task:cancelled'       — (taskId: string) notifies task queue to check dependents
 */
class EventBus extends EventEmitter {}

export const eventBus = new EventBus();
eventBus.setMaxListeners(100); // We'll have many concurrent listeners
