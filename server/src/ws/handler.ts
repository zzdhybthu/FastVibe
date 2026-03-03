import websocket from '@fastify/websocket';
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import type { AppConfig, WsClientEvent, WsServerEvent } from '@vibecoding/shared';
import { eventBus } from './event-bus.js';

interface TrackedClient {
  socket: WebSocket;
  subscribedRepoIds: Set<string>;
}

const clients = new Set<TrackedClient>();

function broadcastHandler(event: WsServerEvent) {
  const payload = JSON.stringify(event);

  for (const client of clients) {
    if (client.socket.readyState !== 1 /* WebSocket.OPEN */) continue;

    if (event.type === 'task:interaction') {
      // Interactions are urgent — send to ALL connected clients
      client.socket.send(payload);
    } else if (event.type === 'task:status') {
      // Only send to clients subscribed to this repo
      if (client.subscribedRepoIds.has(event.repoId)) {
        client.socket.send(payload);
      }
    } else if (event.type === 'task:log') {
      // task:log doesn't carry repoId directly, send to all
      // (task runner should enrich with repoId if needed;
      //  for now we broadcast to all subscribed clients)
      client.socket.send(payload);
    } else if (event.type === 'ping') {
      client.socket.send(payload);
    }
  }
}

export async function registerWebSocket(app: FastifyInstance, config: AppConfig) {
  await app.register(websocket);

  // Listen for broadcast events from the event bus
  eventBus.on('ws:broadcast', broadcastHandler);

  // Ping all connected clients every 30 seconds
  const pingInterval = setInterval(() => {
    const pingEvent: WsServerEvent = { type: 'ping' };
    const payload = JSON.stringify(pingEvent);
    for (const client of clients) {
      if (client.socket.readyState === 1 /* WebSocket.OPEN */) {
        client.socket.send(payload);
      }
    }
  }, 30_000);

  // Clean up on server close
  app.addHook('onClose', async () => {
    clearInterval(pingInterval);
    eventBus.off('ws:broadcast', broadcastHandler);
    for (const client of clients) {
      client.socket.close();
    }
    clients.clear();
  });

  app.get('/ws', { websocket: true }, (socket: WebSocket, req) => {
    // Authenticate via query parameter
    const url = new URL(req.url ?? '', `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token || token !== config.server.authToken) {
      socket.close(4001, 'Unauthorized');
      return;
    }

    // Track this client
    const tracked: TrackedClient = {
      socket,
      subscribedRepoIds: new Set(),
    };
    clients.add(tracked);

    app.log.info(`WebSocket client connected (total: ${clients.size})`);

    socket.on('message', (raw: Buffer | string) => {
      let msg: WsClientEvent;
      try {
        msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf-8'));
      } catch {
        // Ignore invalid JSON
        return;
      }

      if (!msg || typeof msg !== 'object' || !('type' in msg)) return;

      switch (msg.type) {
        case 'subscribe':
          if (typeof msg.repoId === 'string') {
            tracked.subscribedRepoIds.add(msg.repoId);
            app.log.info(`Client subscribed to repo: ${msg.repoId}`);
          }
          break;

        case 'unsubscribe':
          if (typeof msg.repoId === 'string') {
            tracked.subscribedRepoIds.delete(msg.repoId);
            app.log.info(`Client unsubscribed from repo: ${msg.repoId}`);
          }
          break;

        case 'interaction:answer':
          if (typeof msg.interactionId === 'string' && typeof msg.answer === 'string') {
            eventBus.emit('interaction:answered', msg.interactionId, msg.answer);
            app.log.info(`Interaction answer received: ${msg.interactionId}`);
          }
          break;

        default:
          // Unknown message type — ignore
          break;
      }
    });

    socket.on('close', () => {
      clients.delete(tracked);
      app.log.info(`WebSocket client disconnected (total: ${clients.size})`);
    });

    socket.on('error', (err) => {
      app.log.error(`WebSocket error: ${err.message}`);
      clients.delete(tracked);
    });
  });
}
