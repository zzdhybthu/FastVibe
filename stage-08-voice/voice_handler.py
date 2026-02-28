"""
stage-08-voice/voice_handler.py - 服务端语音处理

FastAPI router，接收浏览器录音并通过 faster-whisper 本地转录。
可挂载到任意 FastAPI app:

    from stage_08_voice.voice_handler import router as voice_router
    app.include_router(voice_router)

依赖安装:
    pip install fastapi faster-whisper python-multipart uvicorn
"""

from __future__ import annotations

import os
import sys
import tempfile
import time
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import APIRouter, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse

# ---------------------------------------------------------------------------
# 日志 — 优先使用 shared/logging.py，不可用时降级为标准 logging
# ---------------------------------------------------------------------------
try:
    # 假设项目根目录已在 sys.path 中
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from shared.logging import setup_logger
    logger = setup_logger("voice-handler")
except Exception:
    import logging
    logging.basicConfig(
        level=logging.INFO,
        format="[voice-handler] %(asctime)s %(levelname)s: %(message)s",
    )
    logger = logging.getLogger("voice-handler")

# ---------------------------------------------------------------------------
# 配置
# ---------------------------------------------------------------------------
WHISPER_MODEL: str = os.getenv("WHISPER_MODEL", "base")
WHISPER_DEVICE: str = os.getenv("WHISPER_DEVICE", "auto")    # cpu / cuda / auto
WHISPER_COMPUTE: str = os.getenv("WHISPER_COMPUTE", "int8")  # int8 / float16 / float32
ALLOWED_EXTENSIONS: set[str] = {"webm", "wav", "mp3", "ogg", "m4a", "flac"}
MAX_FILE_SIZE: int = int(os.getenv("VOICE_MAX_FILE_MB", "25")) * 1024 * 1024  # 默认 25 MB

# ---------------------------------------------------------------------------
# Whisper 模型（延迟加载，只在首次请求时初始化）
# ---------------------------------------------------------------------------
_model = None


def _get_model():
    """延迟加载 WhisperModel，避免 import 时就下载模型。"""
    global _model
    if _model is not None:
        return _model

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        raise RuntimeError(
            "faster-whisper 未安装。请运行: pip install faster-whisper"
        )

    logger.info(
        "正在加载 Whisper 模型 '%s' (device=%s, compute=%s) ...",
        WHISPER_MODEL, WHISPER_DEVICE, WHISPER_COMPUTE,
    )
    t0 = time.time()
    try:
        _model = WhisperModel(
            WHISPER_MODEL,
            device=WHISPER_DEVICE,
            compute_type=WHISPER_COMPUTE,
        )
    except Exception as exc:
        logger.error("Whisper 模型加载失败: %s", exc)
        raise RuntimeError(f"Whisper 模型 '{WHISPER_MODEL}' 加载失败: {exc}") from exc

    logger.info("模型加载完成，用时 %.1f 秒", time.time() - t0)
    return _model


def _file_extension(filename: str | None) -> str:
    """从文件名中提取扩展名（不含点），兜底返回空字符串。"""
    if not filename:
        return ""
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------
router = APIRouter(prefix="/api/voice", tags=["voice"])


@router.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    """
    接收音频文件 (multipart/form-data)，返回转录结果。

    请求:
        Content-Type: multipart/form-data
        字段 file: 音频文件 (webm/wav/mp3/ogg/m4a/flac)

    响应:
        {
            "text":     "转录文本",
            "language": "zh",
            "duration": 3.2
        }
    """

    # ---- 1. 验证文件类型 ------------------------------------------------
    ext = _file_extension(file.filename)
    content_type = file.content_type or ""

    # 宽松判断：扩展名或 MIME 类型任一匹配即可
    if ext not in ALLOWED_EXTENSIONS and not content_type.startswith("audio/"):
        raise HTTPException(
            status_code=400,
            detail=f"不支持的音频格式: {ext or content_type}。"
                   f"支持的格式: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    # ---- 2. 读取并写入临时文件 ------------------------------------------
    try:
        audio_bytes = await file.read()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"读取上传文件失败: {exc}")

    if len(audio_bytes) == 0:
        raise HTTPException(status_code=400, detail="上传的音频文件为空")

    if len(audio_bytes) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"文件过大 ({len(audio_bytes) / 1024 / 1024:.1f} MB)，"
                   f"最大允许 {MAX_FILE_SIZE / 1024 / 1024:.0f} MB",
        )

    # 使用 suffix 确保 ffmpeg（faster-whisper 内部）能正确识别格式
    suffix = f".{ext}" if ext else ".webm"
    tmp_path: str | None = None

    try:
        with tempfile.NamedTemporaryFile(
            suffix=suffix, delete=False
        ) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        logger.info(
            "收到音频: %s (%s, %.1f KB) -> %s",
            file.filename, content_type, len(audio_bytes) / 1024, tmp_path,
        )

        # ---- 3. 加载模型 ------------------------------------------------
        try:
            model = _get_model()
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc))

        # ---- 4. 转录 ----------------------------------------------------
        t0 = time.time()
        try:
            segments, info = model.transcribe(
                tmp_path,
                beam_size=5,
                vad_filter=True,           # 静音过滤
                vad_parameters=dict(
                    min_silence_duration_ms=500,
                ),
            )
            # segments 是生成器，需要遍历才能得到文本
            text_parts: list[str] = []
            for segment in segments:
                text_parts.append(segment.text.strip())

            full_text = " ".join(text_parts).strip()
        except Exception as exc:
            logger.error("转录失败: %s", exc)
            raise HTTPException(status_code=500, detail=f"音频转录失败: {exc}")

        elapsed = time.time() - t0
        duration = round(info.duration, 2)
        language = info.language or "unknown"

        logger.info(
            "转录完成: lang=%s, 音频时长=%.1fs, 处理耗时=%.1fs, 文本长度=%d",
            language, duration, elapsed, len(full_text),
        )

        return JSONResponse(content={
            "text": full_text,
            "language": language,
            "duration": duration,
        })

    finally:
        # ---- 5. 清理临时文件 --------------------------------------------
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


# ---------------------------------------------------------------------------
# 健康检查
# ---------------------------------------------------------------------------
@router.get("/health")
async def voice_health():
    """检查语音服务状态。"""
    model_loaded = _model is not None
    return {
        "status": "ok",
        "model": WHISPER_MODEL,
        "model_loaded": model_loaded,
        "device": WHISPER_DEVICE,
        "compute_type": WHISPER_COMPUTE,
    }


# ---------------------------------------------------------------------------
# 独立运行（开发/测试用）
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    from fastapi import FastAPI
    from fastapi.middleware.cors import CORSMiddleware

    app = FastAPI(title="Voice Transcription Service")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(router)

    port = int(os.getenv("VOICE_PORT", "8421"))
    logger.info("语音服务独立启动: http://0.0.0.0:%d", port)
    uvicorn.run(app, host="0.0.0.0", port=port)
