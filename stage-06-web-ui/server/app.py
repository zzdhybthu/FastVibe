"""VibeCoding Web Manager - FastAPI application."""

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, WebSocket, status
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .auth import verify_token
from .cc_process import CCProcessManager
from .websocket_handler import ConnectionManager

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Globals
# ---------------------------------------------------------------------------
process_manager = CCProcessManager()
ws_manager = ConnectionManager()

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"

# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("VibeCoding Web Manager starting up")
    logger.info(f"Serving frontend from: {FRONTEND_DIR}")
    yield
    logger.info("VibeCoding Web Manager shutting down")
    # Kill all running processes on shutdown
    for task_id, proc in process_manager.processes.items():
        if proc.status.value == "running":
            await proc.kill()


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="VibeCoding Web Manager",
    version="1.0.0",
    lifespan=lifespan,
)


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------
class TaskCreate(BaseModel):
    prompt: str
    priority: int = 0
    title: str = ""


class TaskResponse(BaseModel):
    task_id: str
    prompt: str
    priority: int
    title: str
    status: str
    created_at: str
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    exit_code: Optional[int] = None


# ---------------------------------------------------------------------------
# REST API  -  Tasks
# ---------------------------------------------------------------------------
@app.get("/api/tasks", response_model=list[TaskResponse])
async def list_tasks(_token: str = Depends(verify_token)):
    """List all tasks, newest first."""
    return process_manager.list_tasks()


@app.post("/api/tasks", response_model=TaskResponse, status_code=201)
async def create_task(body: TaskCreate, _token: str = Depends(verify_token)):
    """Submit a new task and start it immediately."""
    if not body.prompt.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Prompt cannot be empty",
        )
    proc = process_manager.create_task(
        prompt=body.prompt.strip(),
        priority=body.priority,
        title=body.title.strip(),
    )
    # Fire-and-forget: start the task in background
    import asyncio
    asyncio.create_task(process_manager.start_task(proc.task_id))
    return proc.to_dict()


@app.get("/api/tasks/{task_id}", response_model=TaskResponse)
async def get_task(task_id: str, _token: str = Depends(verify_token)):
    """Get a single task by ID."""
    proc = process_manager.get_task(task_id)
    if not proc:
        raise HTTPException(status_code=404, detail="Task not found")
    return proc.to_dict()


@app.delete("/api/tasks/{task_id}")
async def cancel_task(task_id: str, _token: str = Depends(verify_token)):
    """Cancel a running or pending task."""
    ok = await process_manager.cancel_task(task_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"detail": "Task cancelled", "task_id": task_id}


# ---------------------------------------------------------------------------
# REST API  -  Instances
# ---------------------------------------------------------------------------
@app.get("/api/instances")
async def list_instances(_token: str = Depends(verify_token)):
    """List currently running CC instances."""
    return process_manager.list_instances()


@app.post("/api/instances/{instance_id}/restart")
async def restart_instance(
    instance_id: str, _token: str = Depends(verify_token)
):
    """Restart a CC instance."""
    new_proc = await process_manager.restart_instance(instance_id)
    if not new_proc:
        raise HTTPException(status_code=404, detail="Instance not found")
    return {
        "detail": "Instance restarted",
        "old_id": instance_id,
        "new_id": new_proc.task_id,
    }


# ---------------------------------------------------------------------------
# WebSocket  -  Logs
# ---------------------------------------------------------------------------
@app.websocket("/ws/logs/{instance_id}")
async def websocket_logs(websocket: WebSocket, instance_id: str):
    """Stream real-time logs for a given instance via WebSocket."""
    # NOTE: WebSocket auth is done via query param ?token=...
    token = websocket.query_params.get("token", "")
    auth_token = os.environ.get("VIBE_AUTH_TOKEN", "vibecoding")
    if token != auth_token:
        await websocket.close(code=4001, reason="Unauthorized")
        return

    proc = process_manager.get_task(instance_id)
    if not proc:
        await websocket.close(code=4004, reason="Instance not found")
        return

    await ws_manager.handle_websocket(websocket, instance_id, process_manager)


# ---------------------------------------------------------------------------
# Static files  -  SPA fallback
# ---------------------------------------------------------------------------
# Serve index.html for the root
@app.get("/")
async def serve_index():
    index = FRONTEND_DIR / "index.html"
    if index.exists():
        return FileResponse(index)
    return JSONResponse({"error": "Frontend not found"}, status_code=404)


# Mount static files AFTER API routes so /api/* takes priority
app.mount("/", StaticFiles(directory=str(FRONTEND_DIR)), name="frontend")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "server.app:app",
        host="127.0.0.1",
        port=8420,
        reload=True,
        log_level="info",
    )
