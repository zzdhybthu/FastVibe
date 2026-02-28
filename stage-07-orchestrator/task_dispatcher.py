"""
task_dispatcher.py - 任务分发器

从任务队列获取待执行任务，按策略分发给 CC 实例，跟踪任务状态。
支持目录模式 (stage-03 兼容) 和 SQLite 模式。
"""

import asyncio
import json
import os
import sqlite3
import time
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Callable, Coroutine, Dict, List, Optional


class TaskState(str, Enum):
    PENDING = "pending"
    ASSIGNED = "assigned"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class DispatchStrategy(str, Enum):
    ROUND_ROBIN = "round-robin"
    PRIORITY = "priority"


@dataclass
class Task:
    """一个待分发的任务。"""

    task_id: str
    prompt: str
    priority: int = 0  # 数字越大优先级越高
    state: TaskState = TaskState.PENDING
    assigned_instance: Optional[int] = None
    created_at: float = field(default_factory=time.time)
    started_at: Optional[float] = None
    completed_at: Optional[float] = None
    result: Optional[str] = None
    error: Optional[str] = None
    source_file: Optional[str] = None  # 目录模式下的源文件路径

    def to_dict(self) -> Dict[str, Any]:
        return {
            "task_id": self.task_id,
            "prompt": self.prompt[:200] + ("..." if len(self.prompt) > 200 else ""),
            "priority": self.priority,
            "state": self.state.value,
            "assigned_instance": self.assigned_instance,
            "created_at": self.created_at,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "duration": round(self.completed_at - self.started_at, 1)
            if self.completed_at and self.started_at
            else None,
            "error": self.error,
        }


# 任务完成回调: (task, success) -> None
CompletionCallback = Callable[["Task", bool], Coroutine[Any, Any, None]]


class DirectoryQueue:
    """目录模式任务队列，兼容 stage-03 ralph-loop。

    目录结构:
        task-queue/
            pending/      - 待处理任务文件
            running/      - 正在处理的任务文件
            done/         - 已完成的任务文件
            failed/       - 失败的任务文件

    任务文件格式: 纯文本，文件内容即为 prompt。
    文件名格式: {priority}_{task_id}.md 或 {task_id}.md
    """

    def __init__(self, base_path: str) -> None:
        self._base = Path(base_path)
        self._pending = self._base / "pending"
        self._running = self._base / "running"
        self._done = self._base / "done"
        self._failed = self._base / "failed"

        # 确保目录存在
        for d in (self._pending, self._running, self._done, self._failed):
            d.mkdir(parents=True, exist_ok=True)

    def _parse_filename(self, path: Path) -> tuple[int, str]:
        """从文件名解析 priority 和 task_id。"""
        stem = path.stem
        parts = stem.split("_", 1)
        if len(parts) == 2 and parts[0].isdigit():
            return int(parts[0]), parts[1]
        return 0, stem

    def list_pending(self) -> List[Task]:
        """列出所有待处理任务。"""
        tasks = []
        if not self._pending.exists():
            return tasks

        for f in sorted(self._pending.iterdir()):
            if f.is_file() and not f.name.startswith("."):
                priority, task_id = self._parse_filename(f)
                try:
                    prompt = f.read_text(encoding="utf-8").strip()
                except Exception:
                    continue
                tasks.append(
                    Task(
                        task_id=task_id,
                        prompt=prompt,
                        priority=priority,
                        state=TaskState.PENDING,
                        source_file=str(f),
                    )
                )
        return tasks

    def claim_task(self, task: Task) -> bool:
        """将任务从 pending 移到 running。"""
        if task.source_file is None:
            return False
        src = Path(task.source_file)
        if not src.exists():
            return False
        dst = self._running / src.name
        try:
            src.rename(dst)
            task.source_file = str(dst)
            return True
        except OSError:
            return False

    def complete_task(self, task: Task, success: bool) -> None:
        """将任务从 running 移到 done 或 failed。"""
        if task.source_file is None:
            return
        src = Path(task.source_file)
        if not src.exists():
            return
        target_dir = self._done if success else self._failed
        dst = target_dir / src.name
        try:
            src.rename(dst)
            task.source_file = str(dst)
        except OSError:
            pass


class SQLiteQueue:
    """SQLite 模式任务队列。"""

    def __init__(self, db_path: str) -> None:
        self._db_path = db_path
        self._conn: Optional[sqlite3.Connection] = None
        self._init_db()

    def _init_db(self) -> None:
        """初始化数据库表。"""
        self._conn = sqlite3.connect(self._db_path)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("""
            CREATE TABLE IF NOT EXISTS tasks (
                task_id TEXT PRIMARY KEY,
                prompt TEXT NOT NULL,
                priority INTEGER DEFAULT 0,
                state TEXT DEFAULT 'pending',
                assigned_instance INTEGER,
                created_at REAL,
                started_at REAL,
                completed_at REAL,
                result TEXT,
                error TEXT
            )
        """)
        self._conn.commit()

    def list_pending(self) -> List[Task]:
        """列出所有待处理任务。"""
        if not self._conn:
            return []
        cursor = self._conn.execute(
            "SELECT * FROM tasks WHERE state = 'pending' ORDER BY priority DESC, created_at ASC"
        )
        tasks = []
        for row in cursor.fetchall():
            tasks.append(
                Task(
                    task_id=row["task_id"],
                    prompt=row["prompt"],
                    priority=row["priority"],
                    state=TaskState.PENDING,
                    created_at=row["created_at"] or time.time(),
                )
            )
        return tasks

    def claim_task(self, task: Task) -> bool:
        """标记任务为 assigned。"""
        if not self._conn:
            return False
        try:
            self._conn.execute(
                "UPDATE tasks SET state = 'assigned', started_at = ? WHERE task_id = ? AND state = 'pending'",
                (time.time(), task.task_id),
            )
            self._conn.commit()
            return self._conn.total_changes > 0
        except sqlite3.Error:
            return False

    def complete_task(self, task: Task, success: bool) -> None:
        """标记任务完成或失败。"""
        if not self._conn:
            return
        state = "completed" if success else "failed"
        self._conn.execute(
            "UPDATE tasks SET state = ?, completed_at = ?, result = ?, error = ? WHERE task_id = ?",
            (state, time.time(), task.result, task.error, task.task_id),
        )
        self._conn.commit()

    def close(self) -> None:
        if self._conn:
            self._conn.close()
            self._conn = None


class TaskDispatcher:
    """任务分发器：从队列获取任务，分发给 CC 实例。

    用法:
        dispatcher = TaskDispatcher(
            queue_type="directory",
            queue_path="../stage-03-ralph-loop/task-queue",
            strategy=DispatchStrategy.ROUND_ROBIN,
        )
        task = await dispatcher.next_task()
        dispatcher.assign_task(task, instance_id=0)
        await dispatcher.complete_task(task.task_id, success=True)
    """

    def __init__(
        self,
        queue_type: str = "directory",
        queue_path: str = "../stage-03-ralph-loop/task-queue",
        strategy: DispatchStrategy = DispatchStrategy.ROUND_ROBIN,
        on_complete: Optional[CompletionCallback] = None,
        logger: Optional[Any] = None,
    ) -> None:
        self._strategy = strategy
        self._on_complete = on_complete
        self._logger = logger
        self._rr_index = 0  # round-robin 当前索引

        # 初始化队列后端
        if queue_type == "sqlite":
            db_path = queue_path if queue_path.endswith(".db") else queue_path + "/tasks.db"
            self._queue: Any = SQLiteQueue(db_path)
        else:
            self._queue = DirectoryQueue(queue_path)

        # 内存中的任务跟踪
        self._tasks: Dict[str, Task] = {}
        self._instance_tasks: Dict[int, str] = {}  # instance_id -> task_id
        self._available_instances: List[int] = []

    def _log(self, level: str, msg: str) -> None:
        if self._logger:
            getattr(self._logger, level.lower(), self._logger.info)(msg)

    # ── 实例管理 ──────────────────────────────────────────────

    def register_instances(self, instance_ids: List[int]) -> None:
        """注册可用的实例 ID。"""
        self._available_instances = list(instance_ids)
        self._log("info", f"Registered instances: {instance_ids}")

    def get_idle_instances(self) -> List[int]:
        """返回当前没有分配任务的实例 ID 列表。"""
        busy = set(self._instance_tasks.keys())
        return [i for i in self._available_instances if i not in busy]

    def get_instance_task(self, instance_id: int) -> Optional[Task]:
        """获取实例当前执行的任务。"""
        task_id = self._instance_tasks.get(instance_id)
        return self._tasks.get(task_id) if task_id else None

    # ── 任务获取 ──────────────────────────────────────────────

    async def refresh_queue(self) -> int:
        """刷新任务队列，返回新增任务数量。"""
        pending = await asyncio.get_event_loop().run_in_executor(
            None, self._queue.list_pending
        )
        new_count = 0
        for task in pending:
            if task.task_id not in self._tasks:
                self._tasks[task.task_id] = task
                new_count += 1
        if new_count:
            self._log("info", f"Found {new_count} new pending tasks")
        return new_count

    async def next_task(self) -> Optional[Task]:
        """获取下一个待分发的任务。

        根据策略选择:
        - ROUND_ROBIN: 按 FIFO 顺序
        - PRIORITY: 按 priority 降序
        """
        # 先刷新队列
        await self.refresh_queue()

        pending = [t for t in self._tasks.values() if t.state == TaskState.PENDING]
        if not pending:
            return None

        if self._strategy == DispatchStrategy.PRIORITY:
            pending.sort(key=lambda t: (-t.priority, t.created_at))
        else:
            pending.sort(key=lambda t: t.created_at)

        return pending[0]

    # ── 任务分发 ──────────────────────────────────────────────

    def _select_instance(self) -> Optional[int]:
        """根据策略选择一个空闲实例。"""
        idle = self.get_idle_instances()
        if not idle:
            return None

        if self._strategy == DispatchStrategy.ROUND_ROBIN:
            # 轮询选择
            self._rr_index = self._rr_index % len(self._available_instances)
            for _ in range(len(self._available_instances)):
                iid = self._available_instances[self._rr_index]
                self._rr_index = (self._rr_index + 1) % len(self._available_instances)
                if iid in idle:
                    return iid
            return None
        else:
            # 优先级模式下选负载最轻的
            return idle[0]

    def assign_task(self, task: Task, instance_id: Optional[int] = None) -> bool:
        """将任务分配给指定实例 (或自动选择)。

        Returns:
            True 如果分配成功
        """
        if instance_id is None:
            instance_id = self._select_instance()
        if instance_id is None:
            self._log("warning", f"No idle instance for task {task.task_id}")
            return False

        # 尝试从队列中 claim
        claimed = self._queue.claim_task(task)
        if not claimed and hasattr(self._queue, "claim_task"):
            self._log("warning", f"Failed to claim task {task.task_id}")
            # 目录模式下文件可能已被其他进程取走
            # 但我们仍继续跟踪，因为任务可能来自内存

        task.state = TaskState.ASSIGNED
        task.assigned_instance = instance_id
        task.started_at = time.time()
        self._tasks[task.task_id] = task
        self._instance_tasks[instance_id] = task.task_id

        self._log(
            "info",
            f"Task {task.task_id} assigned to instance {instance_id}",
        )
        return True

    def start_task(self, task_id: str) -> None:
        """标记任务开始执行。"""
        task = self._tasks.get(task_id)
        if task:
            task.state = TaskState.RUNNING
            task.started_at = time.time()

    async def complete_task(
        self,
        task_id: str,
        success: bool,
        result: Optional[str] = None,
        error: Optional[str] = None,
    ) -> None:
        """标记任务完成或失败。"""
        task = self._tasks.get(task_id)
        if not task:
            self._log("warning", f"Unknown task {task_id}")
            return

        task.state = TaskState.COMPLETED if success else TaskState.FAILED
        task.completed_at = time.time()
        task.result = result
        task.error = error

        # 释放实例
        if task.assigned_instance is not None:
            self._instance_tasks.pop(task.assigned_instance, None)

        # 更新队列后端
        await asyncio.get_event_loop().run_in_executor(
            None, self._queue.complete_task, task, success
        )

        duration = ""
        if task.started_at and task.completed_at:
            duration = f" ({round(task.completed_at - task.started_at, 1)}s)"

        status = "completed" if success else "failed"
        self._log("info", f"Task {task_id} {status}{duration}")

        # 回调
        if self._on_complete:
            try:
                await self._on_complete(task, success)
            except Exception as e:
                self._log("error", f"Completion callback error: {e}")

    # ── 自动分发 ──────────────────────────────────────────────

    async def dispatch_pending(self) -> int:
        """尝试将所有待处理任务分发给空闲实例。返回本次分发的任务数。"""
        dispatched = 0
        while True:
            idle = self.get_idle_instances()
            if not idle:
                break

            task = await self.next_task()
            if not task:
                break

            if self.assign_task(task):
                dispatched += 1
            else:
                break

        return dispatched

    # ── 状态报告 ──────────────────────────────────────────────

    def status_report(self) -> Dict[str, Any]:
        """返回任务分发状态报告。"""
        by_state: Dict[str, int] = {}
        for task in self._tasks.values():
            key = task.state.value
            by_state[key] = by_state.get(key, 0) + 1

        return {
            "strategy": self._strategy.value,
            "total_tasks": len(self._tasks),
            "by_state": by_state,
            "instance_assignments": {
                str(iid): tid for iid, tid in self._instance_tasks.items()
            },
            "idle_instances": self.get_idle_instances(),
            "tasks": [t.to_dict() for t in self._tasks.values()],
        }

    def close(self) -> None:
        """清理资源。"""
        if hasattr(self._queue, "close"):
            self._queue.close()
