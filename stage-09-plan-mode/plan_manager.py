"""
stage-09-plan-mode/plan_manager.py - Plan Mode 集成管理器

管理 Claude Code Plan Mode 的完整生命周期:
  submit -> plan_generated -> review -> approved -> executing -> done

使用 SQLite 持久化存储计划数据，提供 FastAPI router 可挂载到 Stage 6 Web UI。
"""

import asyncio
import json
import os
import sqlite3
import sys
import uuid
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Optional

# -- sys.path 处理: 确保能导入 shared 模块 --
_project_root = Path(__file__).resolve().parent.parent
if str(_project_root) not in sys.path:
    sys.path.insert(0, str(_project_root))

from shared.logging import setup_logger  # noqa: E402

from fastapi import APIRouter, HTTPException, status  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

# ---------------------------------------------------------------------------
# Logger
# ---------------------------------------------------------------------------
logger = setup_logger("plan-mode", log_dir=str(Path(__file__).parent / "logs"))

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
DB_PATH = Path(__file__).parent / "plans.db"
CLAUDE_BIN = os.environ.get("CLAUDE_BIN", "claude")

# Plan Mode 使用的系统提示前缀 —— 指示 Claude 生成计划而非直接执行
PLAN_PROMPT_PREFIX = (
    "请先生成一个详细的执行计划，列出每一步要做什么、涉及哪些文件、"
    "预期结果是什么。不要直接执行，只输出计划。\n\n任务描述:\n"
)


# ---------------------------------------------------------------------------
# Enums & Models
# ---------------------------------------------------------------------------
class PlanStatus(str, Enum):
    """计划的生命周期状态。"""
    SUBMITTED = "submitted"           # 用户提交，等待 CC 生成计划
    PLAN_GENERATED = "plan_generated" # CC 已返回计划文本
    REVIEW = "review"                 # 等待人工审阅
    APPROVED = "approved"             # 审阅通过，等待执行
    EXECUTING = "executing"           # 正在执行中
    DONE = "done"                     # 执行完成
    REJECTED = "rejected"             # 被拒绝
    FAILED = "failed"                 # 生成或执行失败


class PlanCreate(BaseModel):
    """创建计划请求体。"""
    task_prompt: str = Field(..., min_length=1, description="任务描述")
    working_dir: Optional[str] = Field(None, description="工作目录 (默认当前目录)")


class PlanUpdate(BaseModel):
    """编辑计划请求体。"""
    plan_text: Optional[str] = Field(None, description="修改后的计划文本")
    task_prompt: Optional[str] = Field(None, description="修改后的任务描述")


class PlanResponse(BaseModel):
    """计划响应模型。"""
    id: str
    task_prompt: str
    plan_text: Optional[str] = None
    execution_result: Optional[str] = None
    status: PlanStatus
    working_dir: Optional[str] = None
    created_at: str
    reviewed_at: Optional[str] = None
    approved_at: Optional[str] = None
    completed_at: Optional[str] = None
    error: Optional[str] = None


# ---------------------------------------------------------------------------
# Database Layer
# ---------------------------------------------------------------------------
class PlanDB:
    """SQLite 存储层 —— 管理计划表的 CRUD 操作。"""

    def __init__(self, db_path: Path = DB_PATH):
        self.db_path = db_path
        self._init_db()

    def _get_conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        return conn

    def _init_db(self) -> None:
        """初始化数据库表。"""
        with self._get_conn() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS plans (
                    id              TEXT PRIMARY KEY,
                    task_prompt     TEXT NOT NULL,
                    plan_text       TEXT,
                    execution_result TEXT,
                    status          TEXT NOT NULL DEFAULT 'submitted',
                    working_dir     TEXT,
                    created_at      TEXT NOT NULL,
                    reviewed_at     TEXT,
                    approved_at     TEXT,
                    completed_at    TEXT,
                    error           TEXT
                )
            """)
            conn.commit()
        logger.info("Database initialized at %s", self.db_path)

    # -- CRUD ---------------------------------------------------------------

    def create(self, task_prompt: str, working_dir: Optional[str] = None) -> dict:
        """创建新计划记录。"""
        plan_id = uuid.uuid4().hex[:12]
        now = datetime.now(timezone.utc).isoformat()
        with self._get_conn() as conn:
            conn.execute(
                """INSERT INTO plans (id, task_prompt, status, working_dir, created_at)
                   VALUES (?, ?, ?, ?, ?)""",
                (plan_id, task_prompt, PlanStatus.SUBMITTED.value, working_dir, now),
            )
            conn.commit()
        logger.info("Created plan %s", plan_id)
        return self.get(plan_id)

    def get(self, plan_id: str) -> Optional[dict]:
        """获取单个计划。"""
        with self._get_conn() as conn:
            row = conn.execute(
                "SELECT * FROM plans WHERE id = ?", (plan_id,)
            ).fetchone()
        return dict(row) if row else None

    def list_all(self, status_filter: Optional[str] = None) -> list[dict]:
        """列出所有计划，可按状态过滤。"""
        with self._get_conn() as conn:
            if status_filter:
                rows = conn.execute(
                    "SELECT * FROM plans WHERE status = ? ORDER BY created_at DESC",
                    (status_filter,),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM plans ORDER BY created_at DESC"
                ).fetchall()
        return [dict(r) for r in rows]

    def update_status(
        self,
        plan_id: str,
        new_status: PlanStatus,
        **extra_fields,
    ) -> Optional[dict]:
        """更新计划状态及附加字段。"""
        sets = ["status = ?"]
        vals: list = [new_status.value]
        for col, val in extra_fields.items():
            sets.append(f"{col} = ?")
            vals.append(val)
        vals.append(plan_id)
        with self._get_conn() as conn:
            conn.execute(
                f"UPDATE plans SET {', '.join(sets)} WHERE id = ?", vals
            )
            conn.commit()
        logger.info("Plan %s -> %s", plan_id, new_status.value)
        return self.get(plan_id)

    def update_fields(self, plan_id: str, **fields) -> Optional[dict]:
        """更新任意字段 (用于编辑计划)。"""
        if not fields:
            return self.get(plan_id)
        sets = []
        vals: list = []
        for col, val in fields.items():
            sets.append(f"{col} = ?")
            vals.append(val)
        vals.append(plan_id)
        with self._get_conn() as conn:
            conn.execute(
                f"UPDATE plans SET {', '.join(sets)} WHERE id = ?", vals
            )
            conn.commit()
        return self.get(plan_id)


# ---------------------------------------------------------------------------
# Core Manager
# ---------------------------------------------------------------------------
class PlanManager:
    """Plan Mode 核心管理器 —— 协调计划生命周期。

    生命周期:
        submit -> plan_generated -> review -> approved -> executing -> done
                                           -> rejected
    """

    def __init__(self, db_path: Path = DB_PATH):
        self.db = PlanDB(db_path)
        self._running_tasks: dict[str, asyncio.Task] = {}

    # -- 提交计划请求 --------------------------------------------------------

    async def submit(
        self, task_prompt: str, working_dir: Optional[str] = None
    ) -> dict:
        """提交新任务，异步调用 CC plan mode 生成计划。

        1. 在 DB 中创建记录 (status=submitted)
        2. 启动后台协程调用 CC 生成计划
        3. 立即返回计划 ID 供前端轮询
        """
        plan = self.db.create(task_prompt, working_dir)
        plan_id = plan["id"]

        # 启动后台任务生成计划
        task = asyncio.create_task(self._generate_plan(plan_id, task_prompt, working_dir))
        self._running_tasks[plan_id] = task

        # 任务完成后自动清理
        task.add_done_callback(lambda t: self._running_tasks.pop(plan_id, None))

        logger.info("Submitted plan %s, generation task started", plan_id)
        return plan

    async def _generate_plan(
        self, plan_id: str, task_prompt: str, working_dir: Optional[str]
    ) -> None:
        """后台协程: 调用 CC plan mode 生成计划文本。"""
        full_prompt = PLAN_PROMPT_PREFIX + task_prompt
        cmd = [
            "env", "-u", "CLAUDECODE",
            CLAUDE_BIN, "-p", full_prompt,
            "--output-format", "json",
        ]

        logger.info("Generating plan for %s: %s", plan_id, " ".join(cmd[:6]) + "...")

        try:
            cwd = working_dir or os.getcwd()
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=cwd,
            )
            stdout, stderr = await proc.communicate()

            if proc.returncode != 0:
                error_msg = stderr.decode("utf-8", errors="replace").strip()
                logger.error("CC plan generation failed for %s: %s", plan_id, error_msg)
                self.db.update_status(
                    plan_id, PlanStatus.FAILED, error=error_msg
                )
                return

            # 解析 CC JSON 输出
            raw = stdout.decode("utf-8", errors="replace").strip()
            plan_text = self._extract_plan_text(raw)

            self.db.update_status(
                plan_id,
                PlanStatus.PLAN_GENERATED,
                plan_text=plan_text,
            )
            # 自动进入 review 状态
            self.db.update_status(
                plan_id,
                PlanStatus.REVIEW,
                reviewed_at=datetime.now(timezone.utc).isoformat(),
            )
            logger.info("Plan %s generated, awaiting review", plan_id)

        except FileNotFoundError:
            error_msg = f"Claude CLI not found: {CLAUDE_BIN}"
            logger.error(error_msg)
            self.db.update_status(plan_id, PlanStatus.FAILED, error=error_msg)
        except Exception as exc:
            error_msg = f"Unexpected error: {exc}"
            logger.error("Plan %s generation error: %s", plan_id, error_msg)
            self.db.update_status(plan_id, PlanStatus.FAILED, error=error_msg)

    @staticmethod
    def _extract_plan_text(raw_output: str) -> str:
        """从 CC JSON 输出中提取计划文本。

        CC --output-format json 返回的格式:
        {"type": "result", "result": "...", ...}

        如果解析失败，返回原始输出。
        """
        try:
            data = json.loads(raw_output)
            # CC JSON 格式: 顶层 result 字段包含文本
            if isinstance(data, dict):
                return data.get("result", raw_output)
            return raw_output
        except (json.JSONDecodeError, KeyError):
            return raw_output

    # -- 审阅 & 批准 --------------------------------------------------------

    async def approve(self, plan_id: str) -> dict:
        """批准计划并开始执行。"""
        plan = self.db.get(plan_id)
        if not plan:
            raise ValueError(f"Plan {plan_id} not found")

        if plan["status"] not in (
            PlanStatus.REVIEW.value,
            PlanStatus.PLAN_GENERATED.value,
        ):
            raise ValueError(
                f"Plan {plan_id} is in '{plan['status']}' status, cannot approve"
            )

        now = datetime.now(timezone.utc).isoformat()
        self.db.update_status(plan_id, PlanStatus.APPROVED, approved_at=now)

        # 启动执行
        task = asyncio.create_task(self._execute_plan(plan_id))
        self._running_tasks[plan_id] = task
        task.add_done_callback(lambda t: self._running_tasks.pop(plan_id, None))

        return self.db.get(plan_id)

    def reject(self, plan_id: str) -> dict:
        """拒绝计划。"""
        plan = self.db.get(plan_id)
        if not plan:
            raise ValueError(f"Plan {plan_id} not found")

        if plan["status"] not in (
            PlanStatus.REVIEW.value,
            PlanStatus.PLAN_GENERATED.value,
        ):
            raise ValueError(
                f"Plan {plan_id} is in '{plan['status']}' status, cannot reject"
            )

        return self.db.update_status(plan_id, PlanStatus.REJECTED)

    def edit(self, plan_id: str, updates: dict) -> dict:
        """编辑计划文本或任务描述 (仅在 review/plan_generated 状态允许)。"""
        plan = self.db.get(plan_id)
        if not plan:
            raise ValueError(f"Plan {plan_id} not found")

        if plan["status"] not in (
            PlanStatus.REVIEW.value,
            PlanStatus.PLAN_GENERATED.value,
        ):
            raise ValueError(
                f"Plan {plan_id} is in '{plan['status']}' status, cannot edit"
            )

        allowed = {"plan_text", "task_prompt"}
        filtered = {k: v for k, v in updates.items() if k in allowed and v is not None}
        if not filtered:
            return plan

        return self.db.update_fields(plan_id, **filtered)

    # -- 执行计划 ------------------------------------------------------------

    async def _execute_plan(self, plan_id: str) -> None:
        """后台协程: 将已批准的计划交给 CC 执行。"""
        plan = self.db.get(plan_id)
        if not plan or not plan.get("plan_text"):
            self.db.update_status(
                plan_id, PlanStatus.FAILED, error="No plan text to execute"
            )
            return

        self.db.update_status(plan_id, PlanStatus.EXECUTING)

        # 构造执行提示: 给 CC 完整的计划上下文
        execution_prompt = (
            f"请严格按照以下计划执行，不要偏离计划内容。\n\n"
            f"原始任务: {plan['task_prompt']}\n\n"
            f"执行计划:\n{plan['plan_text']}"
        )

        cmd = [
            "env", "-u", "CLAUDECODE",
            CLAUDE_BIN, "-p", execution_prompt,
            "--output-format", "json",
        ]

        logger.info("Executing plan %s", plan_id)

        try:
            cwd = plan.get("working_dir") or os.getcwd()
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=cwd,
            )
            stdout, stderr = await proc.communicate()

            if proc.returncode != 0:
                error_msg = stderr.decode("utf-8", errors="replace").strip()
                logger.error("Plan %s execution failed: %s", plan_id, error_msg)
                self.db.update_status(plan_id, PlanStatus.FAILED, error=error_msg)
                return

            raw = stdout.decode("utf-8", errors="replace").strip()
            result_text = PlanManager._extract_plan_text(raw)

            now = datetime.now(timezone.utc).isoformat()
            self.db.update_status(
                plan_id,
                PlanStatus.DONE,
                execution_result=result_text,
                completed_at=now,
            )
            logger.info("Plan %s executed successfully", plan_id)

        except Exception as exc:
            error_msg = f"Execution error: {exc}"
            logger.error("Plan %s: %s", plan_id, error_msg)
            self.db.update_status(plan_id, PlanStatus.FAILED, error=error_msg)

    # -- 查询 ---------------------------------------------------------------

    def get_plan(self, plan_id: str) -> Optional[dict]:
        return self.db.get(plan_id)

    def list_plans(self, status_filter: Optional[str] = None) -> list[dict]:
        return self.db.list_all(status_filter)


# ---------------------------------------------------------------------------
# FastAPI Router (可挂载到 Stage 6 的主应用)
# ---------------------------------------------------------------------------

router = APIRouter(prefix="/api/plans", tags=["plans"])

# 模块级别的 PlanManager 单例，在 router 被 include 时使用
_manager: Optional[PlanManager] = None


def get_manager() -> PlanManager:
    """获取或创建 PlanManager 单例。"""
    global _manager
    if _manager is None:
        _manager = PlanManager()
    return _manager


def _plan_or_404(plan_id: str) -> dict:
    """获取计划或抛出 404。"""
    plan = get_manager().get_plan(plan_id)
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Plan {plan_id} not found",
        )
    return plan


@router.post("", response_model=PlanResponse, status_code=status.HTTP_201_CREATED)
async def create_plan(body: PlanCreate) -> dict:
    """提交计划请求 —— 异步调用 CC 生成计划。

    返回新创建的计划对象，status 为 submitted。
    前端可轮询 GET /api/plans/{id} 等待 plan_generated/review 状态。
    """
    plan = await get_manager().submit(body.task_prompt, body.working_dir)
    return plan


@router.get("", response_model=list[PlanResponse])
async def list_plans(status: Optional[str] = None) -> list[dict]:
    """列出所有计划。

    可选 query param ?status=review 按状态过滤。
    """
    return get_manager().list_plans(status)


@router.get("/{plan_id}", response_model=PlanResponse)
async def get_plan(plan_id: str) -> dict:
    """获取计划详情。"""
    return _plan_or_404(plan_id)


@router.post("/{plan_id}/approve", response_model=PlanResponse)
async def approve_plan(plan_id: str) -> dict:
    """批准计划 —— 开始异步执行。

    仅在 review/plan_generated 状态可用。
    批准后状态变为 approved -> executing -> done。
    """
    _plan_or_404(plan_id)
    try:
        return await get_manager().approve(plan_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=str(exc)
        )


@router.post("/{plan_id}/reject", response_model=PlanResponse)
async def reject_plan(plan_id: str) -> dict:
    """拒绝计划。

    仅在 review/plan_generated 状态可用。
    """
    _plan_or_404(plan_id)
    try:
        return get_manager().reject(plan_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=str(exc)
        )


@router.put("/{plan_id}", response_model=PlanResponse)
async def edit_plan(plan_id: str, body: PlanUpdate) -> dict:
    """编辑计划文本或任务描述。

    仅在 review/plan_generated 状态可用。
    可修改 plan_text (计划正文) 和 task_prompt (原始任务描述)。
    """
    _plan_or_404(plan_id)
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update",
        )
    try:
        return get_manager().edit(plan_id, updates)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=str(exc)
        )


# ---------------------------------------------------------------------------
# Standalone runner (用于开发/测试)
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    from fastapi import FastAPI

    app = FastAPI(title="VibeCoding Plan Mode", version="0.1.0")
    app.include_router(router)

    logger.info("Starting Plan Mode server on http://0.0.0.0:8901")
    uvicorn.run(app, host="0.0.0.0", port=8901)
