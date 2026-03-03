import { useEffect, useRef, useCallback } from 'react';
import type { WsServerEvent } from '@vibecoding/shared';
import { useAppStore } from '../stores/app-store';

const RECONNECT_BASE_DELAY = 1000;
const RECONNECT_MAX_DELAY = 30000;

export function useWebSocket() {
  const token = useAppStore((s) => s.token);
  const selectedRepoId = useAppStore((s) => s.selectedRepoId);
  const updateTaskFromWs = useAppStore((s) => s.updateTaskFromWs);
  const addLogFromWs = useAppStore((s) => s.addLogFromWs);
  const addInteractionFromWs = useAppStore((s) => s.addInteractionFromWs);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subscribedRepoRef = useRef<string | null>(null);

  const connect = useCallback(() => {
    if (!token) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const url = `${protocol}//${host}/ws?token=${encodeURIComponent(token)}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectAttemptRef.current = 0;

      // Subscribe to current repo
      if (selectedRepoId) {
        ws.send(JSON.stringify({ type: 'subscribe', repoId: selectedRepoId }));
        subscribedRepoRef.current = selectedRepoId;
      }
    };

    ws.onmessage = (event) => {
      // Ignore messages from stale connections
      if (wsRef.current !== ws) return;

      try {
        const data = JSON.parse(event.data) as WsServerEvent;

        switch (data.type) {
          case 'task:status':
            updateTaskFromWs(data.task);
            break;
          case 'task:log':
            addLogFromWs(data.taskId, {
              level: data.level,
              message: data.message,
              timestamp: data.timestamp,
            });
            break;
          case 'task:interaction':
            addInteractionFromWs(data.taskId, {
              id: data.interactionId,
              questionData: data.questionData as unknown as string,
            });
            break;
          case 'ping':
            // ignore
            break;
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      subscribedRepoRef.current = null;

      // Only reconnect if this is still the active connection
      if (wsRef.current !== ws) return;

      wsRef.current = null;

      // Reconnect with exponential backoff
      const delay = Math.min(
        RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttemptRef.current),
        RECONNECT_MAX_DELAY,
      );
      reconnectAttemptRef.current++;
      reconnectTimerRef.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [token, selectedRepoId, updateTaskFromWs, addLogFromWs, addInteractionFromWs]);

  // Connect/disconnect based on token
  useEffect(() => {
    if (token) {
      connect();
    }

    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [token, connect]);

  // Subscribe/unsubscribe when selected repo changes
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    // Unsubscribe from previous repo
    if (subscribedRepoRef.current && subscribedRepoRef.current !== selectedRepoId) {
      ws.send(JSON.stringify({ type: 'unsubscribe', repoId: subscribedRepoRef.current }));
    }

    // Subscribe to new repo
    if (selectedRepoId) {
      ws.send(JSON.stringify({ type: 'subscribe', repoId: selectedRepoId }));
      subscribedRepoRef.current = selectedRepoId;
    } else {
      subscribedRepoRef.current = null;
    }
  }, [selectedRepoId]);
}
