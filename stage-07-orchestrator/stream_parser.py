"""
stream_parser.py - 解析 CC stream-json 输出

CC 在 --output-format stream-json 模式下，每行输出一个 JSON 对象，
包含 type 字段标识消息类型 (assistant, result, error, tool_use 等)。
本模块提供异步迭代器接口来解析这些事件流。
"""

import json
import asyncio
from dataclasses import dataclass, field
from datetime import datetime
from typing import AsyncIterator, Optional, Set


# CC stream-json 中已知的错误模式关键词
ERROR_PATTERNS: Set[str] = {
    "rate_limit",
    "context_window_exceeded",
    "overloaded",
    "invalid_request",
    "authentication_error",
    "connection_error",
}


@dataclass
class Event:
    """CC stream-json 中解析出的单条事件。"""

    type: str
    content: str
    timestamp: datetime = field(default_factory=datetime.now)
    raw: dict = field(default_factory=dict)

    @property
    def is_error(self) -> bool:
        return self.type == "error"

    @property
    def error_pattern(self) -> Optional[str]:
        """检测事件是否匹配已知错误模式，返回匹配的模式名或 None。"""
        if not self.is_error:
            return None
        raw_str = json.dumps(self.raw).lower()
        for pattern in ERROR_PATTERNS:
            if pattern in raw_str:
                return pattern
        # 也检查 content 字段
        content_lower = self.content.lower()
        for pattern in ERROR_PATTERNS:
            if pattern in content_lower:
                return pattern
        return None


class StreamParser:
    """解析 CC stream-json 输出流。

    使用方式:
        parser = StreamParser()
        async for event in parser.parse(process.stdout):
            print(event.type, event.content)
    """

    def __init__(self) -> None:
        self._line_count: int = 0
        self._error_count: int = 0
        self._last_event: Optional[Event] = None

    @property
    def line_count(self) -> int:
        return self._line_count

    @property
    def error_count(self) -> int:
        return self._error_count

    @property
    def last_event(self) -> Optional[Event]:
        return self._last_event

    def _parse_line(self, line: str) -> Optional[Event]:
        """解析单行 JSON，返回 Event 或 None (空行/无效行)。"""
        stripped = line.strip()
        if not stripped:
            return None

        try:
            data = json.loads(stripped)
        except json.JSONDecodeError:
            # 非 JSON 行作为 raw_text 事件返回
            return Event(
                type="raw_text",
                content=stripped,
                raw={"raw_line": stripped},
            )

        if not isinstance(data, dict):
            return Event(
                type="raw_text",
                content=str(data),
                raw={"raw_line": stripped},
            )

        event_type = data.get("type", "unknown")

        # 提取内容: 根据不同 type 选择合适的字段
        content = ""
        if event_type == "assistant":
            # 助手消息可能在 message.content 或 content 中
            message = data.get("message", {})
            if isinstance(message, dict):
                msg_content = message.get("content", "")
                if isinstance(msg_content, list):
                    # content 是列表，拼接 text 类型的块
                    parts = []
                    for block in msg_content:
                        if isinstance(block, dict) and block.get("type") == "text":
                            parts.append(block.get("text", ""))
                    content = "\n".join(parts)
                elif isinstance(msg_content, str):
                    content = msg_content
            else:
                content = data.get("content", "")
        elif event_type == "content_block_delta":
            delta = data.get("delta", {})
            content = delta.get("text", "") if isinstance(delta, dict) else ""
        elif event_type == "result":
            result = data.get("result", data.get("content", ""))
            content = result if isinstance(result, str) else json.dumps(result)
        elif event_type == "error":
            error = data.get("error", {})
            if isinstance(error, dict):
                content = error.get("message", json.dumps(error))
            else:
                content = str(error)
        elif event_type == "tool_use":
            tool_name = data.get("name", data.get("tool", "unknown_tool"))
            tool_input = data.get("input", {})
            content = f"{tool_name}: {json.dumps(tool_input, ensure_ascii=False)}"
        elif event_type == "tool_result":
            content = data.get("content", data.get("output", ""))
            if not isinstance(content, str):
                content = json.dumps(content, ensure_ascii=False)
        else:
            content = data.get("content", data.get("text", ""))
            if not isinstance(content, str):
                content = json.dumps(content, ensure_ascii=False) if content else ""

        event = Event(
            type=event_type,
            content=content,
            raw=data,
        )

        if event.is_error:
            self._error_count += 1

        return event

    async def parse(self, stream: asyncio.StreamReader) -> AsyncIterator[Event]:
        """异步迭代解析 stream-json 流。

        Args:
            stream: asyncio.StreamReader，通常是 process.stdout

        Yields:
            Event: 解析出的事件
        """
        while True:
            try:
                line_bytes = await stream.readline()
            except (ConnectionResetError, BrokenPipeError):
                break

            if not line_bytes:
                # EOF
                break

            self._line_count += 1

            try:
                line = line_bytes.decode("utf-8", errors="replace")
            except Exception:
                continue

            event = self._parse_line(line)
            if event is not None:
                self._last_event = event
                yield event

    async def parse_lines(self, lines: list[str]) -> AsyncIterator[Event]:
        """从字符串行列表解析事件（用于测试）。

        Args:
            lines: JSON 行列表

        Yields:
            Event: 解析出的事件
        """
        for line in lines:
            self._line_count += 1
            event = self._parse_line(line)
            if event is not None:
                self._last_event = event
                yield event
