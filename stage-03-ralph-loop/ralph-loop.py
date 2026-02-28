#!/usr/bin/env python3
"""
ralph-loop.py - Python 版任务队列循环 (SQLite 后端)

支持优先级、重试、超时、并发执行。

CLI:
    add "prompt" [--priority N] [--title T]
    list [--status S]
    run [--workers N]
    reset <id>
"""

from __future__ import annotations

import argparse
import asyncio
import os
import signal
import sqlite3
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

# 让 shared/ 可导入
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from shared.logging import setup_logger  # noqa: E402

# ---------- 常量 ----------
DB_NAME = "ralph_tasks.db"
DEFAULT_WORKERS = 2
DEFAULT_TIMEOUT = 300
DEFAULT_MAX_RETRIES = 2
POLL_INTERVAL = 5  # 秒

STATUSES = ("pending", "in_progress", "done", "failed")

logger = setup_logger("ralph-loop", log_dir="/tmp/cc-logs")


# ================================================================
#  数据库层
# ================================================================

def _db_path(db_dir: str | None = None) -> str:
    """返回数据库文件的绝对路径。"""
    base = Path(db_dir) if db_dir else Path(__file__).resolve().parent
    return str(base / DB_NAME)


def init_db(db_dir: str | None = None) -> sqlite3.Connection:
    """初始化 SQLite 数据库并创建表。"""
    path = _db_path(db_dir)
    conn = sqlite3.connect(path, isolation_level="DEFERRED")
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS tasks (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            title       TEXT NOT NULL DEFAULT '',
            prompt      TEXT NOT NULL,
            status      TEXT NOT NULL DEFAULT 'pending'
                        CHECK(status IN ('pending','in_progress','done','failed')),
            priority    INTEGER NOT NULL DEFAULT 5
                        CHECK(priority BETWEEN 1 AND 10),
            created_at  TEXT NOT NULL DEFAULT (datetime('now')),
            started_at  TEXT,
            finished_at TEXT,
            exit_code   INTEGER,
            retries     INTEGER NOT NULL DEFAULT 0,
            max_retries INTEGER NOT NULL DEFAULT 2,
            output_log  TEXT NOT NULL DEFAULT ''
        )
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_tasks_status_priority
        ON tasks(status, priority)
    """)
    conn.commit()
    logger.info("数据库已初始化: %s", path)
    return conn


# ================================================================
#  任务操作
# ================================================================

def add_task(
    conn: sqlite3.Connection,
    prompt: str,
    priority: int = 5,
    title: str = "",
    max_retries: int = DEFAULT_MAX_RETRIES,
) -> int:
    """添加新任务，返回任务 ID。"""
    cur = conn.execute(
        """INSERT INTO tasks (title, prompt, priority, max_retries)
           VALUES (?, ?, ?, ?)""",
        (title, prompt, priority, max_retries),
    )
    conn.commit()
    task_id: int = cur.lastrowid  # type: ignore[assignment]
    logger.info("任务已添加: id=%d title=%r priority=%d", task_id, title, priority)
    return task_id


def list_tasks(
    conn: sqlite3.Connection,
    status: str | None = None,
) -> list[sqlite3.Row]:
    """列出任务，可按状态筛选。"""
    if status:
        if status not in STATUSES:
            logger.error("无效状态: %s (可选: %s)", status, ", ".join(STATUSES))
            return []
        rows = conn.execute(
            "SELECT * FROM tasks WHERE status = ? ORDER BY priority, id",
            (status,),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM tasks ORDER BY status, priority, id"
        ).fetchall()
    return rows


def reset_task(conn: sqlite3.Connection, task_id: int) -> bool:
    """将任务重置为 pending 状态。"""
    cur = conn.execute(
        """UPDATE tasks
           SET status='pending', started_at=NULL, finished_at=NULL,
               exit_code=NULL, retries=0, output_log=''
           WHERE id = ?""",
        (task_id,),
    )
    conn.commit()
    if cur.rowcount == 0:
        logger.error("未找到任务: id=%d", task_id)
        return False
    logger.info("任务已重置: id=%d", task_id)
    return True


def _claim_next_task(conn: sqlite3.Connection) -> Optional[sqlite3.Row]:
    """原子地获取下一个待执行的任务 (优先级最高、ID 最小)。"""
    row = conn.execute(
        """SELECT id FROM tasks
           WHERE status = 'pending'
           ORDER BY priority, id
           LIMIT 1"""
    ).fetchone()
    if row is None:
        return None

    task_id = row["id"]
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    conn.execute(
        """UPDATE tasks
           SET status='in_progress', started_at=?
           WHERE id = ? AND status='pending'""",
        (now, task_id),
    )
    conn.commit()

    return conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()


def _finish_task(
    conn: sqlite3.Connection,
    task_id: int,
    exit_code: int,
    output: str,
) -> None:
    """标记任务完成或失败，如可重试则回到 pending。"""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

    if exit_code == 0:
        conn.execute(
            """UPDATE tasks
               SET status='done', finished_at=?, exit_code=?, output_log=?
               WHERE id = ?""",
            (now, exit_code, output, task_id),
        )
    else:
        # 检查是否可以重试
        row = conn.execute(
            "SELECT retries, max_retries FROM tasks WHERE id = ?",
            (task_id,),
        ).fetchone()
        retries = row["retries"] + 1
        if retries < row["max_retries"]:
            conn.execute(
                """UPDATE tasks
                   SET status='pending', started_at=NULL,
                       retries=?, output_log=output_log || ? || char(10)
                   WHERE id = ?""",
                (retries, f"[retry {retries}] exit_code={exit_code}", task_id),
            )
            logger.info(
                "任务 id=%d 失败 (exit=%d)，排队重试 (%d/%d)",
                task_id, exit_code, retries, row["max_retries"],
            )
        else:
            conn.execute(
                """UPDATE tasks
                   SET status='failed', finished_at=?, exit_code=?, output_log=?
                   WHERE id = ?""",
                (now, exit_code, output, task_id),
            )
            logger.info("任务 id=%d 最终失败 (exit=%d)", task_id, exit_code)

    conn.commit()


# ================================================================
#  异步执行器
# ================================================================

async def _execute_task(
    task: sqlite3.Row,
    db_dir: str | None,
    timeout: int,
) -> None:
    """在子进程中调用 Claude Code 执行单个任务。"""
    task_id: int = task["id"]
    prompt: str = task["prompt"]
    logger.info("开始执行任务: id=%d title=%r", task_id, task["title"])

    try:
        proc = await asyncio.create_subprocess_exec(
            "env", "-u", "CLAUDECODE",
            "claude", "-p", prompt,
            "--output-format", "stream-json",
            "--verbose",
            "--dangerously-skip-permissions",
            stdin=asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        try:
            stdout_bytes, stderr_bytes = await asyncio.wait_for(
                proc.communicate(),
                timeout=timeout,
            )
        except asyncio.TimeoutError:
            logger.warning("任务 id=%d 超时 (%ds)，终止进程", task_id, timeout)
            proc.kill()
            await proc.wait()
            stdout_bytes = b""
            stderr_bytes = f"TIMEOUT after {timeout}s".encode()

        exit_code = proc.returncode or 1
        output = (stdout_bytes.decode(errors="replace")
                  + "\n--- stderr ---\n"
                  + stderr_bytes.decode(errors="replace"))

    except Exception as exc:
        logger.exception("任务 id=%d 执行异常: %s", task_id, exc)
        exit_code = 1
        output = f"EXCEPTION: {exc}"

    # 写回数据库 (同步，但在线程池中执行以避免阻塞事件循环)
    conn = init_db(db_dir)
    try:
        _finish_task(conn, task_id, exit_code, output[-10000:])  # 截断日志
    finally:
        conn.close()

    status_str = "done" if exit_code == 0 else "failed/retry"
    logger.info("任务 id=%d 结束: %s (exit=%d)", task_id, status_str, exit_code)


async def run_loop(
    workers: int = DEFAULT_WORKERS,
    timeout: int = DEFAULT_TIMEOUT,
    db_dir: str | None = None,
    once: bool = False,
) -> None:
    """主事件循环：并发执行任务。"""
    logger.info(
        "Ralph Loop 启动: workers=%d, timeout=%ds, once=%s",
        workers, timeout, once,
    )

    loop = asyncio.get_event_loop()
    stop_event = asyncio.Event()

    def _handle_signal() -> None:
        logger.info("收到退出信号")
        stop_event.set()

    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, _handle_signal)

    sem = asyncio.Semaphore(workers)
    running_tasks: set[asyncio.Task[None]] = set()

    async def _worker(task: sqlite3.Row) -> None:
        async with sem:
            await _execute_task(task, db_dir, timeout)

    while not stop_event.is_set():
        conn = init_db(db_dir)
        try:
            task = _claim_next_task(conn)
        finally:
            conn.close()

        if task is None:
            if once:
                logger.info("单次模式且无待处理任务，等待已运行任务完成")
                break
            try:
                await asyncio.wait_for(stop_event.wait(), timeout=POLL_INTERVAL)
            except asyncio.TimeoutError:
                pass
            continue

        t = asyncio.create_task(_worker(task))
        running_tasks.add(t)
        t.add_done_callback(running_tasks.discard)

        if once:
            # 单次模式：提交一个就退出循环
            break

    # 等待所有正在运行的任务完成
    if running_tasks:
        logger.info("等待 %d 个运行中的任务完成...", len(running_tasks))
        await asyncio.gather(*running_tasks, return_exceptions=True)

    logger.info("Ralph Loop 结束")


# ================================================================
#  CLI
# ================================================================

def _format_row(row: sqlite3.Row) -> str:
    """格式化一行任务信息。"""
    return (
        f"  [{row['id']:>4d}] "
        f"status={row['status']:<12s} "
        f"pri={row['priority']} "
        f"retries={row['retries']}/{row['max_retries']} "
        f"exit={str(row['exit_code']) if row['exit_code'] is not None else '-':>3s} "
        f"title={row['title'] or '(untitled)'}"
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Ralph Loop - Python 版任务队列 (SQLite 后端)",
    )
    parser.add_argument(
        "--db-dir",
        default=None,
        help="SQLite 数据库所在目录 (默认: 脚本所在目录)",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    # --- add ---
    p_add = sub.add_parser("add", help="添加任务")
    p_add.add_argument("prompt", help="任务 prompt")
    p_add.add_argument("--priority", type=int, default=5, help="优先级 1-10, 1 最高 (默认 5)")
    p_add.add_argument("--title", default="", help="任务标题")
    p_add.add_argument("--max-retries", type=int, default=DEFAULT_MAX_RETRIES, help="最大重试次数")

    # --- list ---
    p_list = sub.add_parser("list", help="列出任务")
    p_list.add_argument("--status", default=None, choices=STATUSES, help="按状态筛选")

    # --- run ---
    p_run = sub.add_parser("run", help="启动执行循环")
    p_run.add_argument("--workers", type=int, default=DEFAULT_WORKERS, help="并发 worker 数 (默认 2)")
    p_run.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT, help="单任务超时秒数 (默认 300)")
    p_run.add_argument("--once", action="store_true", help="只执行一个任务后退出")

    # --- reset ---
    p_reset = sub.add_parser("reset", help="重置任务为 pending")
    p_reset.add_argument("task_id", type=int, help="任务 ID")

    args = parser.parse_args()

    conn = init_db(args.db_dir)

    try:
        if args.command == "add":
            task_id = add_task(
                conn,
                prompt=args.prompt,
                priority=args.priority,
                title=args.title,
                max_retries=args.max_retries,
            )
            print(f"Task added: id={task_id}")

        elif args.command == "list":
            rows = list_tasks(conn, status=args.status)
            if not rows:
                print("No tasks found.")
            else:
                print(f"Tasks ({len(rows)}):")
                for row in rows:
                    print(_format_row(row))

        elif args.command == "run":
            conn.close()
            asyncio.run(run_loop(
                workers=args.workers,
                timeout=args.timeout,
                db_dir=args.db_dir,
                once=args.once,
            ))
            return  # conn 已关闭

        elif args.command == "reset":
            if reset_task(conn, args.task_id):
                print(f"Task {args.task_id} reset to pending.")
            else:
                print(f"Task {args.task_id} not found.")
                sys.exit(1)
    finally:
        if conn:
            try:
                conn.close()
            except Exception:
                pass


if __name__ == "__main__":
    main()
