"""WebSocket handler for real-time log streaming."""

import asyncio
import logging
from typing import Optional

from fastapi import WebSocket, WebSocketDisconnect

from .cc_process import CCProcessManager

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages WebSocket connections for log streaming."""

    def __init__(self):
        # instance_id -> set of active WebSocket connections
        self.active_connections: dict[str, set[WebSocket]] = {}
        # instance_id -> asyncio task for reading output
        self._reader_tasks: dict[str, asyncio.Task] = {}

    async def connect(
        self, websocket: WebSocket, instance_id: str, manager: CCProcessManager
    ) -> None:
        """Accept a WebSocket connection and start streaming logs."""
        await websocket.accept()

        if instance_id not in self.active_connections:
            self.active_connections[instance_id] = set()
        self.active_connections[instance_id].add(websocket)

        logger.info(f"WebSocket connected for instance {instance_id}")

        # Start a reader task if one isn't already running
        proc = manager.get_task(instance_id)
        if proc and instance_id not in self._reader_tasks:
            task = asyncio.create_task(
                self._read_and_broadcast(instance_id, manager)
            )
            self._reader_tasks[instance_id] = task

    def disconnect(self, websocket: WebSocket, instance_id: str) -> None:
        """Remove a WebSocket connection."""
        conns = self.active_connections.get(instance_id)
        if conns:
            conns.discard(websocket)
            if not conns:
                del self.active_connections[instance_id]
                # Cancel the reader task if no more connections
                reader = self._reader_tasks.pop(instance_id, None)
                if reader:
                    reader.cancel()

        logger.info(f"WebSocket disconnected for instance {instance_id}")

    async def _read_and_broadcast(
        self, instance_id: str, manager: CCProcessManager
    ) -> None:
        """Read from process output queue and broadcast to all connections."""
        proc = manager.get_task(instance_id)
        if not proc:
            return

        try:
            while True:
                try:
                    message = await asyncio.wait_for(
                        proc.output_queue.get(), timeout=30.0
                    )
                    await self.broadcast(instance_id, message)
                except asyncio.TimeoutError:
                    # Send heartbeat to keep connections alive
                    await self.broadcast(instance_id, "")
                except asyncio.CancelledError:
                    break
        except Exception as e:
            logger.error(f"Reader task error for {instance_id}: {e}")
        finally:
            self._reader_tasks.pop(instance_id, None)

    async def broadcast(self, instance_id: str, message: str) -> None:
        """Send a message to all connections for an instance."""
        conns = self.active_connections.get(instance_id, set()).copy()
        dead = set()

        for ws in conns:
            try:
                await ws.send_text(message)
            except Exception:
                dead.add(ws)

        # Clean up dead connections
        for ws in dead:
            self.disconnect(ws, instance_id)

    async def handle_websocket(
        self,
        websocket: WebSocket,
        instance_id: str,
        manager: CCProcessManager,
    ) -> None:
        """Full lifecycle handler for a WebSocket connection."""
        await self.connect(websocket, instance_id, manager)

        try:
            while True:
                # Keep the connection open; listen for client messages
                data = await websocket.receive_text()
                # Client can send "ping" for heartbeat
                if data == "ping":
                    await websocket.send_text("pong")
        except WebSocketDisconnect:
            self.disconnect(websocket, instance_id)
        except Exception as e:
            logger.error(f"WebSocket error for {instance_id}: {e}")
            self.disconnect(websocket, instance_id)
