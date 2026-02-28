"""
instance_monitor.py - CC 实例健康检查与监控

跟踪每个 CC 子进程的运行状态，检测卡死和崩溃，支持自动重启。
"""

import asyncio
import json
import os
import signal
import time
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Callable, Coroutine, Dict, List, Optional


class InstanceState(str, Enum):
    """CC 实例状态。"""

    IDLE = "idle"
    RUNNING = "running"
    STALLED = "stalled"
    CRASHED = "crashed"
    STOPPING = "stopping"
    STOPPED = "stopped"


@dataclass
class InstanceInfo:
    """单个 CC 实例的运行时信息。"""

    instance_id: int
    pid: Optional[int] = None
    state: InstanceState = InstanceState.IDLE
    current_task_id: Optional[str] = None
    last_output_time: float = field(default_factory=time.time)
    start_time: Optional[float] = None
    restart_count: int = 0
    total_tasks_completed: int = 0
    last_error: Optional[str] = None
    process: Optional[asyncio.subprocess.Process] = None

    def to_dict(self) -> Dict[str, Any]:
        """导出为 JSON 可序列化的字典。"""
        return {
            "instance_id": self.instance_id,
            "pid": self.pid,
            "state": self.state.value,
            "current_task_id": self.current_task_id,
            "last_output_time": datetime.fromtimestamp(self.last_output_time).isoformat()
            if self.last_output_time
            else None,
            "start_time": datetime.fromtimestamp(self.start_time).isoformat()
            if self.start_time
            else None,
            "restart_count": self.restart_count,
            "total_tasks_completed": self.total_tasks_completed,
            "last_error": self.last_error,
            "uptime_seconds": round(time.time() - self.start_time, 1)
            if self.start_time
            else 0,
            "idle_seconds": round(time.time() - self.last_output_time, 1)
            if self.last_output_time
            else 0,
        }


# 启动 CC 实例的回调类型
StartCallback = Callable[[int], Coroutine[Any, Any, asyncio.subprocess.Process]]


class InstanceMonitor:
    """监控所有 CC 实例的健康状态。

    用法:
        monitor = InstanceMonitor(
            max_instances=3,
            stall_timeout=120,
            health_check_interval=30,
            max_retries=2,
        )
        monitor.register_instance(0)
        monitor.update_output(0)   # 收到输出时调用
        report = monitor.health_report()
    """

    def __init__(
        self,
        max_instances: int = 3,
        stall_timeout: float = 120.0,
        health_check_interval: float = 30.0,
        max_retries: int = 2,
        on_restart: Optional[StartCallback] = None,
        logger: Optional[Any] = None,
    ) -> None:
        self._max_instances = max_instances
        self._stall_timeout = stall_timeout
        self._health_check_interval = health_check_interval
        self._max_retries = max_retries
        self._on_restart = on_restart
        self._logger = logger

        self._instances: Dict[int, InstanceInfo] = {}
        self._check_task: Optional[asyncio.Task[None]] = None
        self._running = False

    def _log(self, level: str, msg: str) -> None:
        if self._logger:
            getattr(self._logger, level.lower(), self._logger.info)(msg)

    # ── 实例注册 ──────────────────────────────────────────────

    def register_instance(
        self,
        instance_id: int,
        process: Optional[asyncio.subprocess.Process] = None,
    ) -> InstanceInfo:
        """注册一个新的 CC 实例。"""
        info = InstanceInfo(
            instance_id=instance_id,
            pid=process.pid if process else None,
            state=InstanceState.RUNNING if process else InstanceState.IDLE,
            start_time=time.time() if process else None,
            last_output_time=time.time(),
            process=process,
        )
        self._instances[instance_id] = info
        self._log("info", f"Instance {instance_id} registered (pid={info.pid})")
        return info

    def unregister_instance(self, instance_id: int) -> None:
        """注销实例。"""
        self._instances.pop(instance_id, None)
        self._log("info", f"Instance {instance_id} unregistered")

    def get_instance(self, instance_id: int) -> Optional[InstanceInfo]:
        return self._instances.get(instance_id)

    @property
    def instances(self) -> Dict[int, InstanceInfo]:
        return dict(self._instances)

    # ── 状态更新 ──────────────────────────────────────────────

    def update_output(self, instance_id: int) -> None:
        """收到实例输出时调用，刷新 last_output_time。"""
        info = self._instances.get(instance_id)
        if info:
            info.last_output_time = time.time()
            if info.state == InstanceState.STALLED:
                info.state = InstanceState.RUNNING
                self._log("info", f"Instance {instance_id} recovered from stall")

    def set_task(self, instance_id: int, task_id: Optional[str]) -> None:
        """设置实例当前执行的任务。"""
        info = self._instances.get(instance_id)
        if info:
            if task_id is None and info.current_task_id is not None:
                info.total_tasks_completed += 1
            info.current_task_id = task_id
            info.last_output_time = time.time()

    def mark_crashed(self, instance_id: int, error: Optional[str] = None) -> None:
        """标记实例已崩溃。"""
        info = self._instances.get(instance_id)
        if info:
            info.state = InstanceState.CRASHED
            info.last_error = error
            info.process = None
            info.pid = None
            self._log("warning", f"Instance {instance_id} crashed: {error}")

    def mark_stopped(self, instance_id: int) -> None:
        """标记实例已停止。"""
        info = self._instances.get(instance_id)
        if info:
            info.state = InstanceState.STOPPED
            info.process = None
            info.pid = None

    # ── 健康检查 ──────────────────────────────────────────────

    def _check_stall(self, info: InstanceInfo) -> bool:
        """检查实例是否卡死。返回 True 表示卡死。"""
        if info.state not in (InstanceState.RUNNING, InstanceState.STALLED):
            return False
        idle = time.time() - info.last_output_time
        return idle > self._stall_timeout

    def _check_crashed(self, info: InstanceInfo) -> bool:
        """检查进程是否已退出。返回 True 表示崩溃。"""
        if info.process is None:
            return info.state == InstanceState.RUNNING
        return info.process.returncode is not None

    async def _do_health_check(self) -> List[int]:
        """执行一轮健康检查，返回需要重启的实例 ID 列表。"""
        needs_restart: List[int] = []

        for iid, info in list(self._instances.items()):
            if info.state in (InstanceState.STOPPING, InstanceState.STOPPED, InstanceState.IDLE):
                continue

            # 检测崩溃
            if self._check_crashed(info):
                exit_code = info.process.returncode if info.process else "N/A"
                self.mark_crashed(iid, f"Process exited with code {exit_code}")
                if info.restart_count < self._max_retries:
                    needs_restart.append(iid)
                continue

            # 检测卡死
            if self._check_stall(info):
                idle_secs = round(time.time() - info.last_output_time, 1)
                if info.state != InstanceState.STALLED:
                    info.state = InstanceState.STALLED
                    self._log(
                        "warning",
                        f"Instance {iid} stalled ({idle_secs}s without output)",
                    )
                # 卡死超过 2 倍 stall_timeout 则强制重启
                if idle_secs > self._stall_timeout * 2:
                    self._log("warning", f"Instance {iid} force restart after {idle_secs}s stall")
                    await self._kill_instance(info)
                    self.mark_crashed(iid, f"Force killed after {idle_secs}s stall")
                    if info.restart_count < self._max_retries:
                        needs_restart.append(iid)

        return needs_restart

    async def _kill_instance(self, info: InstanceInfo) -> None:
        """强制终止实例进程。"""
        if info.process is None:
            return
        try:
            info.process.terminate()
            try:
                await asyncio.wait_for(info.process.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                info.process.kill()
                await info.process.wait()
        except ProcessLookupError:
            pass

    async def _restart_instance(self, instance_id: int) -> bool:
        """尝试重启实例。"""
        info = self._instances.get(instance_id)
        if not info:
            return False

        if self._on_restart is None:
            self._log("error", f"No restart callback for instance {instance_id}")
            return False

        self._log("info", f"Restarting instance {instance_id} (attempt {info.restart_count + 1})")

        try:
            new_process = await self._on_restart(instance_id)
            info.process = new_process
            info.pid = new_process.pid
            info.state = InstanceState.RUNNING
            info.start_time = time.time()
            info.last_output_time = time.time()
            info.restart_count += 1
            info.last_error = None
            self._log("info", f"Instance {instance_id} restarted (pid={info.pid})")
            return True
        except Exception as e:
            self._log("error", f"Failed to restart instance {instance_id}: {e}")
            info.last_error = str(e)
            return False

    # ── 后台监控循环 ──────────────────────────────────────────

    async def start(self) -> None:
        """启动后台健康检查循环。"""
        if self._running:
            return
        self._running = True
        self._check_task = asyncio.create_task(self._monitor_loop())
        self._log("info", "InstanceMonitor started")

    async def stop(self) -> None:
        """停止后台健康检查循环。"""
        self._running = False
        if self._check_task:
            self._check_task.cancel()
            try:
                await self._check_task
            except asyncio.CancelledError:
                pass
            self._check_task = None
        self._log("info", "InstanceMonitor stopped")

    async def _monitor_loop(self) -> None:
        """健康检查主循环。"""
        while self._running:
            try:
                needs_restart = await self._do_health_check()
                for iid in needs_restart:
                    await self._restart_instance(iid)
            except asyncio.CancelledError:
                break
            except Exception as e:
                self._log("error", f"Health check error: {e}")

            try:
                await asyncio.sleep(self._health_check_interval)
            except asyncio.CancelledError:
                break

    # ── 健康报告 ──────────────────────────────────────────────

    def health_report(self) -> Dict[str, Any]:
        """生成所有实例的健康状态 JSON 报告。"""
        instances_data = []
        summary = {
            "total": len(self._instances),
            "running": 0,
            "idle": 0,
            "stalled": 0,
            "crashed": 0,
            "stopped": 0,
        }

        for info in self._instances.values():
            # 实时更新卡死检测
            if info.state == InstanceState.RUNNING and self._check_stall(info):
                info.state = InstanceState.STALLED

            instances_data.append(info.to_dict())
            state_key = info.state.value
            if state_key in summary:
                summary[state_key] += 1

        return {
            "timestamp": datetime.now().isoformat(),
            "summary": summary,
            "stall_timeout": self._stall_timeout,
            "max_retries": self._max_retries,
            "instances": instances_data,
        }

    def health_report_json(self, indent: int = 2) -> str:
        """健康报告的 JSON 字符串。"""
        return json.dumps(self.health_report(), indent=indent, ensure_ascii=False)

    # ── 优雅停止所有实例 ──────────────────────────────────────

    async def stop_all_instances(self, timeout: float = 10.0) -> None:
        """优雅停止所有正在运行的实例。"""
        for info in self._instances.values():
            if info.state in (InstanceState.RUNNING, InstanceState.STALLED):
                info.state = InstanceState.STOPPING

        tasks = []
        for info in self._instances.values():
            if info.state == InstanceState.STOPPING and info.process:
                tasks.append(self._graceful_stop(info, timeout))

        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    async def _graceful_stop(self, info: InstanceInfo, timeout: float) -> None:
        """优雅停止单个实例。"""
        if info.process is None:
            info.state = InstanceState.STOPPED
            return

        try:
            info.process.terminate()
            try:
                await asyncio.wait_for(info.process.wait(), timeout=timeout)
            except asyncio.TimeoutError:
                self._log("warning", f"Instance {info.instance_id} did not exit, killing")
                info.process.kill()
                await info.process.wait()
        except ProcessLookupError:
            pass
        finally:
            info.state = InstanceState.STOPPED
            info.process = None
            info.pid = None
            self._log("info", f"Instance {info.instance_id} stopped")
