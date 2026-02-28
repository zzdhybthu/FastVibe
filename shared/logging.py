"""
shared/logging.py - VibeCoding 统一日志模块
"""
import logging
import sys
from pathlib import Path
from datetime import datetime


def setup_logger(
    name: str,
    log_dir: str | None = None,
    level: int = logging.INFO,
    console: bool = True,
) -> logging.Logger:
    """创建统一格式的 logger。

    Args:
        name: logger 名称，通常用 stage 名如 "ralph-loop"
        log_dir: 日志文件目录，None 则不写文件
        level: 日志级别
        console: 是否输出到终端
    """
    logger = logging.getLogger(name)
    logger.setLevel(level)

    if logger.handlers:
        return logger

    formatter = logging.Formatter(
        fmt="[%(name)s] %(asctime)s %(levelname)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    if console:
        ch = logging.StreamHandler(sys.stderr)
        ch.setLevel(level)
        ch.setFormatter(formatter)
        logger.addHandler(ch)

    if log_dir:
        log_path = Path(log_dir)
        log_path.mkdir(parents=True, exist_ok=True)
        today = datetime.now().strftime("%Y%m%d")
        fh = logging.FileHandler(log_path / f"{name}_{today}.log")
        fh.setLevel(level)
        fh.setFormatter(formatter)
        logger.addHandler(fh)

    return logger
