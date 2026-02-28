"""
orchestrator.py - CC 编排管理器

整合 StreamParser, InstanceMonitor, TaskDispatcher，
提供 CLI 接口管理多个 CC 实例并行执行任务。

用法:
    python orchestrator.py start          # 启动编排器
    python orchestrator.py start -n 2     # 启动 2 个实例
    python orchestrator.py status         # 查看状态
    python orchestrator.py stop           # 停止所有实例
"""

import argparse
import asyncio
import json
import os
import signal
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml

# 添加 shared/ 到模块路径
_project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_project_root / "shared"))

from logging import getLogger

from stream_parser import Event, StreamParser
from instance_monitor import InstanceMonitor, InstanceState
from task_dispatcher import DispatchStrategy, Task, TaskDispatcher

# 使用 shared/logging.py
try:
    from logging import setup_logger  # type: ignore[attr-defined]
except ImportError:
    # fallback: 如果 shared/logging.py 通过 importlib 加载
    import importlib.util

    _logging_spec = importlib.util.spec_from_file_location(
        "shared_logging",
        str(_project_root / "shared" / "logging.py"),
    )
    if _logging_spec and _logging_spec.loader:
        _shared_logging = importlib.util.module_from_spec(_logging_spec)
        _logging_spec.loader.exec_module(_shared_logging)  # type: ignore[union-attr]
        setup_logger = _shared_logging.setup_logger  # type: ignore[attr-defined]
    else:
        # 最终 fallback
        import logging as _stdlib_logging

        def setup_logger(
            name: str,
            log_dir: Optional[str] = None,
            level: int = _stdlib_logging.INFO,
            console: bool = True,
        ) -> _stdlib_logging.Logger:
            logger = _stdlib_logging.getLogger(name)
            logger.setLevel(level)
            if not logger.handlers and console:
                handler = _stdlib_logging.StreamHandler(sys.stderr)
                handler.setFormatter(
                    _stdlib_logging.Formatter(
                        "[%(name)s] %(asctime)s %(levelname)s: %(message)s",
                        datefmt="%Y-%m-%d %H:%M:%S",
                    )
                )
                logger.addHandler(handler)
            return logger


# PID 文件路径
PID_FILE = Path(__file__).resolve().parent / ".orchestrator.pid"
STATUS_FILE = Path(__file__).resolve().parent / ".orchestrator.status"


def load_config(config_path: Optional[str] = None) -> Dict[str, Any]:
    """加载配置文件。"""
    if config_path is None:
        config_path = str(Path(__file__).resolve().parent / "config.yaml")

    path = Path(config_path)
    if not path.exists():
        raise FileNotFoundError(f"Config file not found: {config_path}")

    with open(path, "r", encoding="utf-8") as f:
        config = yaml.safe_load(f)

    return config or {}


class Orchestrator:
    """CC 编排管理器。

    管理多个 CC 实例，从任务队列获取任务并分发执行。
    """

    def __init__(self, config: Dict[str, Any]) -> None:
        self._config = config
        self._orch_cfg = config.get("orchestrator", {})
        self._cc_cfg = config.get("cc", {})
        self._queue_cfg = config.get("queue", {})
        self._log_cfg = config.get("logging", {})

        # 日志
        log_level_str = self._log_cfg.get("level", "INFO").upper()
        import logging as _logging

        log_level = getattr(_logging, log_level_str, _logging.INFO)
        log_dir = self._log_cfg.get("dir")
        if log_dir:
            log_dir = str(Path(__file__).resolve().parent / log_dir)

        self._logger = setup_logger(
            name="orchestrator",
            log_dir=log_dir,
            level=log_level,
        )

        # 参数
        self._max_instances: int = self._orch_cfg.get("max_instances", 3)
        self._task_timeout: float = float(self._orch_cfg.get("task_timeout", 300))
        self._health_check_interval: float = float(
            self._orch_cfg.get("health_check_interval", 30)
        )
        self._max_retries: int = self._orch_cfg.get("max_retries", 2)
        self._stall_timeout: float = float(self._orch_cfg.get("stall_timeout", 120))

        # 组件 (延迟初始化)
        self._monitor: Optional[InstanceMonitor] = None
        self._dispatcher: Optional[TaskDispatcher] = None
        self._parsers: Dict[int, StreamParser] = {}

        # 运行状态
        self._running = False
        self._shutdown_event = asyncio.Event()
        self._instance_tasks: Dict[int, asyncio.Task[None]] = {}

    # ── CC 进程管理 ────────────────────────────────────────────

    def _build_cc_command(self, prompt: str) -> List[str]:
        """构建 CC 命令行。"""
        cmd = [self._cc_cfg.get("command", "claude")]

        output_format = self._cc_cfg.get("output_format", "stream-json")
        cmd.extend(["--output-format", output_format])

        if self._cc_cfg.get("verbose", False):
            cmd.append("--verbose")

        if self._cc_cfg.get("dangerously_skip_permissions", False):
            cmd.append("--dangerously-skip-permissions")

        cmd.extend(["--print", prompt])

        return cmd

    async def _start_cc_process(
        self, instance_id: int, prompt: Optional[str] = None
    ) -> asyncio.subprocess.Process:
        """启动一个 CC 子进程。"""
        if prompt is None:
            prompt = "echo ready"

        cmd = self._build_cc_command(prompt)

        # 避免 CC 嵌套检测
        env = os.environ.copy()
        env.pop("CLAUDECODE", None)

        self._logger.info(f"[Instance {instance_id}] Starting: {' '.join(cmd[:5])}...")

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )

        return process

    async def _restart_callback(self, instance_id: int) -> asyncio.subprocess.Process:
        """InstanceMonitor 的重启回调。"""
        # 获取实例当前任务
        task = self._dispatcher.get_instance_task(instance_id) if self._dispatcher else None
        prompt = task.prompt if task else "echo restarted"
        return await self._start_cc_process(instance_id, prompt)

    # ── 实例运行循环 ──────────────────────────────────────────

    async def _run_instance(self, instance_id: int) -> None:
        """单个实例的主循环：获取任务 -> 执行 -> 完成 -> 下一个。"""
        self._logger.info(f"[Instance {instance_id}] Worker started")
        parser = StreamParser()
        self._parsers[instance_id] = parser

        while self._running:
            # 获取下一个任务
            if not self._dispatcher:
                break

            task = await self._dispatcher.next_task()
            if task is None:
                # 队列为空，等待后重试
                try:
                    await asyncio.sleep(5)
                except asyncio.CancelledError:
                    break
                continue

            # 分配任务
            if not self._dispatcher.assign_task(task, instance_id):
                continue

            self._dispatcher.start_task(task.task_id)

            if self._monitor:
                self._monitor.set_task(instance_id, task.task_id)

            # 启动 CC 进程
            try:
                process = await self._start_cc_process(instance_id, task.prompt)
            except Exception as e:
                self._logger.error(f"[Instance {instance_id}] Failed to start CC: {e}")
                await self._dispatcher.complete_task(
                    task.task_id, success=False, error=str(e)
                )
                if self._monitor:
                    self._monitor.set_task(instance_id, None)
                continue

            # 注册到监控
            if self._monitor:
                info = self._monitor.get_instance(instance_id)
                if info:
                    info.process = process
                    info.pid = process.pid
                    info.state = InstanceState.RUNNING
                    info.start_time = time.time()
                    info.last_output_time = time.time()

            # 读取输出
            collected_output: List[str] = []
            success = True
            error_msg: Optional[str] = None

            try:
                async for event in parser.parse(process.stdout):  # type: ignore[arg-type]
                    if not self._running:
                        break

                    # 更新监控
                    if self._monitor:
                        self._monitor.update_output(instance_id)

                    # 收集输出
                    if event.content:
                        collected_output.append(event.content)

                    # 检测错误
                    if event.is_error:
                        error_pattern = event.error_pattern
                        self._logger.warning(
                            f"[Instance {instance_id}] Error: {event.content} "
                            f"(pattern={error_pattern})"
                        )
                        if error_pattern in ("rate_limit", "overloaded"):
                            # 可恢复错误，等待后重试
                            self._logger.info(
                                f"[Instance {instance_id}] Recoverable error, will retry"
                            )
                        elif error_pattern == "context_window_exceeded":
                            error_msg = "Context window exceeded"
                            success = False

            except asyncio.CancelledError:
                self._logger.info(f"[Instance {instance_id}] Cancelled")
                break
            except Exception as e:
                self._logger.error(f"[Instance {instance_id}] Stream error: {e}")
                error_msg = str(e)
                success = False

            # 等待进程结束
            try:
                return_code = await asyncio.wait_for(
                    process.wait(), timeout=30.0
                )
                if return_code != 0 and success:
                    # 读取 stderr
                    stderr_bytes = await process.stderr.read() if process.stderr else b""  # type: ignore[union-attr]
                    stderr_text = stderr_bytes.decode("utf-8", errors="replace").strip()
                    error_msg = f"CC exited with code {return_code}: {stderr_text[:500]}"
                    success = False
            except asyncio.TimeoutError:
                self._logger.warning(f"[Instance {instance_id}] CC process timeout, killing")
                process.kill()
                error_msg = "Process timeout"
                success = False

            # 任务完成
            result_text = "\n".join(collected_output) if collected_output else None
            await self._dispatcher.complete_task(
                task.task_id,
                success=success,
                result=result_text,
                error=error_msg,
            )

            if self._monitor:
                self._monitor.set_task(instance_id, None)

            self._logger.info(
                f"[Instance {instance_id}] Task {task.task_id} "
                f"{'completed' if success else 'failed'}"
            )

        self._logger.info(f"[Instance {instance_id}] Worker stopped")

    # ── 编排器生命周期 ────────────────────────────────────────

    async def start(self, num_instances: Optional[int] = None) -> None:
        """启动编排器。"""
        if self._running:
            self._logger.warning("Orchestrator is already running")
            return

        n = num_instances or self._max_instances
        self._logger.info(f"Starting orchestrator with {n} instances")

        self._running = True

        # 初始化组件
        self._monitor = InstanceMonitor(
            max_instances=n,
            stall_timeout=self._stall_timeout,
            health_check_interval=self._health_check_interval,
            max_retries=self._max_retries,
            on_restart=self._restart_callback,
            logger=self._logger,
        )

        queue_path = self._queue_cfg.get("path", "../stage-03-ralph-loop/task-queue")
        # 解析相对路径
        if not os.path.isabs(queue_path):
            queue_path = str(Path(__file__).resolve().parent / queue_path)

        self._dispatcher = TaskDispatcher(
            queue_type=self._queue_cfg.get("type", "directory"),
            queue_path=queue_path,
            strategy=DispatchStrategy.ROUND_ROBIN,
            logger=self._logger,
        )

        # 注册实例
        instance_ids = list(range(n))
        self._dispatcher.register_instances(instance_ids)

        for iid in instance_ids:
            self._monitor.register_instance(iid)

        # 启动监控
        await self._monitor.start()

        # 写 PID 文件
        self._write_pid_file()

        # 启动实例 worker
        for iid in instance_ids:
            task = asyncio.create_task(self._run_instance(iid))
            self._instance_tasks[iid] = task

        self._logger.info(f"Orchestrator started ({n} instances)")

        # 等待关闭信号
        await self._shutdown_event.wait()

        # 清理
        await self._shutdown()

    async def _shutdown(self) -> None:
        """优雅关闭所有组件。"""
        self._logger.info("Shutting down orchestrator...")
        self._running = False

        # 取消所有 worker
        for iid, task in self._instance_tasks.items():
            task.cancel()

        if self._instance_tasks:
            await asyncio.gather(
                *self._instance_tasks.values(), return_exceptions=True
            )
        self._instance_tasks.clear()

        # 停止所有 CC 进程
        if self._monitor:
            await self._monitor.stop_all_instances(timeout=10.0)
            await self._monitor.stop()

        # 清理 dispatcher
        if self._dispatcher:
            self._dispatcher.close()

        # 删除 PID 文件
        self._remove_pid_file()

        self._logger.info("Orchestrator stopped")

    def request_shutdown(self) -> None:
        """请求优雅关闭 (可从信号处理器调用)。"""
        self._logger.info("Shutdown requested")
        self._shutdown_event.set()

    # ── 状态查询 ──────────────────────────────────────────────

    def status(self) -> Dict[str, Any]:
        """返回编排器当前状态。"""
        report: Dict[str, Any] = {
            "running": self._running,
            "config": {
                "max_instances": self._max_instances,
                "task_timeout": self._task_timeout,
                "stall_timeout": self._stall_timeout,
            },
        }

        if self._monitor:
            report["instances"] = self._monitor.health_report()

        if self._dispatcher:
            report["tasks"] = self._dispatcher.status_report()

        return report

    def status_json(self, indent: int = 2) -> str:
        return json.dumps(self.status(), indent=indent, ensure_ascii=False)

    # ── PID 文件管理 ──────────────────────────────────────────

    def _write_pid_file(self) -> None:
        PID_FILE.write_text(str(os.getpid()), encoding="utf-8")

    @staticmethod
    def _remove_pid_file() -> None:
        PID_FILE.unlink(missing_ok=True)

    @staticmethod
    def _read_pid() -> Optional[int]:
        if PID_FILE.exists():
            try:
                return int(PID_FILE.read_text().strip())
            except (ValueError, OSError):
                pass
        return None

    def _write_status(self) -> None:
        """将当前状态写到文件，供 status 命令读取。"""
        STATUS_FILE.write_text(self.status_json(), encoding="utf-8")

    @staticmethod
    def _read_status() -> Optional[Dict[str, Any]]:
        if STATUS_FILE.exists():
            try:
                return json.loads(STATUS_FILE.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                pass
        return None


# ── 信号处理 ──────────────────────────────────────────────────

_orchestrator_ref: Optional[Orchestrator] = None


def _signal_handler(sig: int, frame: Any) -> None:
    """SIGTERM/SIGINT 处理器。"""
    if _orchestrator_ref:
        _orchestrator_ref.request_shutdown()


# ── CLI ───────────────────────────────────────────────────────


def cmd_start(args: argparse.Namespace) -> None:
    """start 命令: 启动编排器。"""
    global _orchestrator_ref

    config = load_config(args.config)
    orchestrator = Orchestrator(config)
    _orchestrator_ref = orchestrator

    # 注册信号处理
    signal.signal(signal.SIGTERM, _signal_handler)
    signal.signal(signal.SIGINT, _signal_handler)

    num_instances = args.instances or config.get("orchestrator", {}).get("max_instances", 3)

    print(f"Starting orchestrator with {num_instances} instances...")
    print(f"Config: {args.config or 'config.yaml (default)'}")
    print(f"Queue: {config.get('queue', {}).get('path', 'N/A')}")
    print("Press Ctrl+C to stop.\n")

    asyncio.run(orchestrator.start(num_instances=num_instances))


def cmd_status(args: argparse.Namespace) -> None:
    """status 命令: 显示编排器状态。"""
    pid = Orchestrator._read_pid()
    if pid is None:
        print("Orchestrator is not running (no PID file found)")
        sys.exit(1)

    # 检查进程是否存在
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        print(f"Orchestrator PID {pid} is not running (stale PID file)")
        Orchestrator._remove_pid_file()
        sys.exit(1)
    except PermissionError:
        pass  # 进程存在但无权发信号

    print(f"Orchestrator is running (PID: {pid})")

    # 尝试读取状态文件
    status_data = Orchestrator._read_status()
    if status_data:
        print(json.dumps(status_data, indent=2, ensure_ascii=False))
    else:
        print("(Status file not available - send SIGUSR1 to refresh)")

    # 发送 SIGUSR1 请求刷新状态
    try:
        os.kill(pid, signal.SIGUSR1)
    except (ProcessLookupError, PermissionError, OSError):
        pass


def cmd_stop(args: argparse.Namespace) -> None:
    """stop 命令: 停止编排器。"""
    pid = Orchestrator._read_pid()
    if pid is None:
        print("Orchestrator is not running (no PID file found)")
        sys.exit(1)

    print(f"Sending SIGTERM to orchestrator (PID: {pid})...")
    try:
        os.kill(pid, signal.SIGTERM)
        print("Shutdown signal sent. Waiting for graceful exit...")

        # 等待进程退出
        for _ in range(30):
            try:
                os.kill(pid, 0)
                time.sleep(1)
            except ProcessLookupError:
                print("Orchestrator stopped.")
                return
            except PermissionError:
                break

        print("Orchestrator did not stop within 30s. Use kill -9 if needed.")
    except ProcessLookupError:
        print(f"Process {pid} already exited.")
        Orchestrator._remove_pid_file()
    except PermissionError:
        print(f"Permission denied to signal process {pid}")
        sys.exit(1)


def build_parser() -> argparse.ArgumentParser:
    """构建 CLI 参数解析器。"""
    parser = argparse.ArgumentParser(
        description="CC Orchestrator - Manage multiple Claude Code instances",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python orchestrator.py start              # Start with default config
  python orchestrator.py start -n 2         # Start 2 instances
  python orchestrator.py start -c my.yaml   # Use custom config
  python orchestrator.py status             # Show status
  python orchestrator.py stop               # Graceful stop
        """,
    )

    subparsers = parser.add_subparsers(dest="command", help="Available commands")
    subparsers.required = True

    # start
    start_p = subparsers.add_parser("start", help="Start the orchestrator")
    start_p.add_argument(
        "-n",
        "--instances",
        type=int,
        default=None,
        help="Number of CC instances (overrides config)",
    )
    start_p.add_argument(
        "-c",
        "--config",
        type=str,
        default=None,
        help="Path to config file (default: config.yaml)",
    )
    start_p.set_defaults(func=cmd_start)

    # status
    status_p = subparsers.add_parser("status", help="Show orchestrator status")
    status_p.set_defaults(func=cmd_status)

    # stop
    stop_p = subparsers.add_parser("stop", help="Stop the orchestrator")
    stop_p.set_defaults(func=cmd_stop)

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
