"""CC (Claude Code) subprocess management."""

import asyncio
import os
import signal
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional


class ProcessStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class CCProcess:
    """Manages a single Claude Code subprocess."""

    task_id: str
    prompt: str
    priority: int = 0
    title: str = ""
    status: ProcessStatus = ProcessStatus.PENDING
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    exit_code: Optional[int] = None
    output_queue: asyncio.Queue = field(default_factory=asyncio.Queue)
    _process: Optional[asyncio.subprocess.Process] = field(
        default=None, repr=False
    )

    def to_dict(self) -> dict:
        """Serialize to dict for API responses."""
        return {
            "task_id": self.task_id,
            "prompt": self.prompt,
            "priority": self.priority,
            "title": self.title or self.prompt[:60],
            "status": self.status.value,
            "created_at": self.created_at,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "exit_code": self.exit_code,
        }

    async def spawn(self, cwd: Optional[str] = None) -> None:
        """Start the CC subprocess."""
        env = os.environ.copy()
        # Remove CLAUDECODE env var to avoid conflicts
        env.pop("CLAUDECODE", None)

        # Default to git repo root as working directory
        if cwd is None:
            cwd = os.path.abspath(
                os.path.join(os.path.dirname(__file__), "..", "..")
            )

        self.status = ProcessStatus.RUNNING
        self.started_at = datetime.utcnow().isoformat()

        await self.output_queue.put(
            f"[{self.started_at}] Starting task: {self.title or self.prompt[:60]}\n"
            f"[INFO] Working directory: {cwd}\n"
        )

        try:
            self._process = await asyncio.create_subprocess_exec(
                "env", "-u", "CLAUDECODE",
                "claude", "--print", "--dangerously-skip-permissions",
                self.prompt,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env,
                cwd=cwd,
            )
            # Start reading output in background
            asyncio.create_task(self._stream_output())
        except FileNotFoundError:
            self.status = ProcessStatus.FAILED
            self.finished_at = datetime.utcnow().isoformat()
            self.exit_code = -1
            await self.output_queue.put(
                "[ERROR] 'claude' command not found. Is Claude Code CLI installed?\n"
            )
        except Exception as e:
            self.status = ProcessStatus.FAILED
            self.finished_at = datetime.utcnow().isoformat()
            self.exit_code = -1
            await self.output_queue.put(f"[ERROR] Failed to start process: {e}\n")

    async def _stream_output(self) -> None:
        """Read stdout/stderr and push to the output queue."""
        if self._process is None:
            return

        async def _read_stream(stream, prefix=""):
            while True:
                line = await stream.readline()
                if not line:
                    break
                decoded = line.decode("utf-8", errors="replace")
                await self.output_queue.put(f"{prefix}{decoded}")

        try:
            await asyncio.gather(
                _read_stream(self._process.stdout),
                _read_stream(self._process.stderr, "[stderr] "),
            )
            self.exit_code = await self._process.wait()
            self.finished_at = datetime.utcnow().isoformat()

            if self.status == ProcessStatus.RUNNING:
                self.status = (
                    ProcessStatus.COMPLETED
                    if self.exit_code == 0
                    else ProcessStatus.FAILED
                )

            await self.output_queue.put(
                f"\n[{self.finished_at}] Process exited with code {self.exit_code}\n"
            )
        except asyncio.CancelledError:
            await self.kill()
        except Exception as e:
            self.status = ProcessStatus.FAILED
            self.finished_at = datetime.utcnow().isoformat()
            await self.output_queue.put(f"[ERROR] Stream error: {e}\n")

    async def kill(self) -> None:
        """Kill the subprocess."""
        if self._process and self._process.returncode is None:
            try:
                self._process.send_signal(signal.SIGTERM)
                try:
                    await asyncio.wait_for(self._process.wait(), timeout=5.0)
                except asyncio.TimeoutError:
                    self._process.kill()
                    await self._process.wait()
            except ProcessLookupError:
                pass

        self.status = ProcessStatus.CANCELLED
        self.finished_at = datetime.utcnow().isoformat()
        self.exit_code = -9
        await self.output_queue.put("[INFO] Process killed by user\n")

    def get_status(self) -> dict:
        """Get current process status."""
        return self.to_dict()


class CCProcessManager:
    """Manages all CC subprocesses."""

    def __init__(self):
        self.processes: dict[str, CCProcess] = {}

    def create_task(
        self, prompt: str, priority: int = 0, title: str = ""
    ) -> CCProcess:
        """Create a new task (does not start it)."""
        task_id = str(uuid.uuid4())[:8]
        proc = CCProcess(
            task_id=task_id,
            prompt=prompt,
            priority=priority,
            title=title,
        )
        self.processes[task_id] = proc
        return proc

    async def start_task(self, task_id: str) -> None:
        """Start a pending task."""
        proc = self.processes.get(task_id)
        if proc and proc.status == ProcessStatus.PENDING:
            await proc.spawn()

    async def cancel_task(self, task_id: str) -> bool:
        """Cancel/kill a task."""
        proc = self.processes.get(task_id)
        if not proc:
            return False
        if proc.status == ProcessStatus.RUNNING:
            await proc.kill()
        elif proc.status == ProcessStatus.PENDING:
            proc.status = ProcessStatus.CANCELLED
            proc.finished_at = datetime.utcnow().isoformat()
        return True

    def get_task(self, task_id: str) -> Optional[CCProcess]:
        """Get a task by ID."""
        return self.processes.get(task_id)

    def list_tasks(self) -> list[dict]:
        """List all tasks."""
        tasks = sorted(
            self.processes.values(),
            key=lambda p: p.created_at,
            reverse=True,
        )
        return [t.to_dict() for t in tasks]

    def list_instances(self) -> list[dict]:
        """List running instances (tasks with RUNNING status)."""
        running = [
            p for p in self.processes.values()
            if p.status == ProcessStatus.RUNNING
        ]
        return [
            {
                "instance_id": p.task_id,
                "title": p.title or p.prompt[:60],
                "status": p.status.value,
                "started_at": p.started_at,
                "pid": p._process.pid if p._process else None,
            }
            for p in running
        ]

    async def restart_instance(self, instance_id: str) -> Optional[CCProcess]:
        """Restart a task by killing and re-spawning it."""
        old = self.processes.get(instance_id)
        if not old:
            return None

        # Kill the old process if running
        if old.status == ProcessStatus.RUNNING:
            await old.kill()

        # Create and start a new process with the same prompt
        new_proc = self.create_task(
            prompt=old.prompt,
            priority=old.priority,
            title=old.title,
        )
        await new_proc.spawn()
        return new_proc
