/**
 * stage-08-voice/voice_web_component.js
 *
 * 浏览器端录音 Web 组件。使用 MediaRecorder API 录音，
 * 录音结束后自动上传至 /api/voice/transcribe 获取转录文本，
 * 并将结果填充到指定的 textarea。
 *
 * 用法:
 *   import VoiceRecorder from './voice_web_component.js';
 *
 *   const recorder = new VoiceRecorder({
 *     textarea: document.getElementById('my-textarea'),   // 必须
 *     mode: 'toggle',              // 'toggle' (默认) | 'push-to-talk'
 *     apiUrl: '/api/voice/transcribe',
 *     mountTo: document.getElementById('toolbar'),        // 可选，按钮挂载位置
 *     onResult: (result) => {},     // 可选回调
 *     onError: (err) => {},         // 可选回调
 *     onStatusChange: (status) => {},
 *   });
 *
 *   // 销毁
 *   recorder.destroy();
 */

class VoiceRecorder {
  // -----------------------------------------------------------------------
  // 构造
  // -----------------------------------------------------------------------
  constructor(options = {}) {
    this.textarea = options.textarea || null;
    this.mode = options.mode || 'toggle';          // 'toggle' | 'push-to-talk'
    this.apiUrl = options.apiUrl || '/api/voice/transcribe';
    this.mountTo = options.mountTo || null;
    this.onResult = options.onResult || null;
    this.onError = options.onError || null;
    this.onStatusChange = options.onStatusChange || null;
    this.appendMode = options.appendMode !== undefined ? options.appendMode : true;

    // 内部状态
    this._mediaRecorder = null;
    this._stream = null;
    this._chunks = [];
    this._recording = false;
    this._transcribing = false;

    // UI
    this._button = null;
    this._statusEl = null;
    this._container = null;

    this._createUI();
    this._bindEvents();
  }

  // -----------------------------------------------------------------------
  // UI 创建
  // -----------------------------------------------------------------------
  _createUI() {
    // 容器
    this._container = document.createElement('div');
    this._container.className = 'voice-recorder';
    Object.assign(this._container.style, {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '8px',
      position: 'relative',
    });

    // 麦克风按钮
    this._button = document.createElement('button');
    this._button.type = 'button';
    this._button.className = 'voice-recorder-btn';
    this._button.title = this.mode === 'push-to-talk'
      ? '按住录音'
      : '点击开始/停止录音';
    this._button.innerHTML = this._micSVG();
    Object.assign(this._button.style, {
      width: '40px',
      height: '40px',
      borderRadius: '50%',
      border: '2px solid #666',
      background: '#f5f5f5',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0',
      transition: 'all 0.2s ease',
      flexShrink: '0',
    });

    // 状态文字
    this._statusEl = document.createElement('span');
    this._statusEl.className = 'voice-recorder-status';
    Object.assign(this._statusEl.style, {
      fontSize: '13px',
      color: '#888',
      whiteSpace: 'nowrap',
      minWidth: '0',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    });

    this._container.appendChild(this._button);
    this._container.appendChild(this._statusEl);

    // 注入样式（只注入一次）
    if (!document.getElementById('voice-recorder-styles')) {
      const style = document.createElement('style');
      style.id = 'voice-recorder-styles';
      style.textContent = `
        .voice-recorder-btn:hover {
          border-color: #333 !important;
          background: #e8e8e8 !important;
        }
        .voice-recorder-btn.recording {
          border-color: #e53935 !important;
          background: #ffebee !important;
          animation: voice-pulse 1s ease-in-out infinite;
        }
        .voice-recorder-btn.transcribing {
          border-color: #1e88e5 !important;
          background: #e3f2fd !important;
          opacity: 0.7;
          cursor: wait !important;
        }
        @keyframes voice-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(229, 57, 53, 0.4); }
          50%       { box-shadow: 0 0 0 8px rgba(229, 57, 53, 0); }
        }
      `;
      document.head.appendChild(style);
    }

    // 挂载
    if (this.mountTo) {
      this.mountTo.appendChild(this._container);
    } else if (this.textarea) {
      // 默认插入到 textarea 旁边
      this.textarea.parentNode.insertBefore(
        this._container,
        this.textarea.nextSibling,
      );
    } else {
      document.body.appendChild(this._container);
    }
  }

  // -----------------------------------------------------------------------
  // SVG 图标
  // -----------------------------------------------------------------------
  _micSVG() {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="2" stroke-linecap="round"
      stroke-linejoin="round">
      <rect x="9" y="1" width="6" height="12" rx="3" />
      <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>`;
  }

  // -----------------------------------------------------------------------
  // 事件绑定
  // -----------------------------------------------------------------------
  _bindEvents() {
    if (this.mode === 'push-to-talk') {
      // 按住录音
      this._onMouseDown = (e) => { e.preventDefault(); this.startRecording(); };
      this._onMouseUp   = (e) => { e.preventDefault(); this.stopRecording(); };
      this._button.addEventListener('mousedown', this._onMouseDown);
      this._button.addEventListener('mouseup',   this._onMouseUp);
      this._button.addEventListener('mouseleave', this._onMouseUp);
      // 触屏
      this._button.addEventListener('touchstart', this._onMouseDown, { passive: false });
      this._button.addEventListener('touchend',   this._onMouseUp,   { passive: false });
    } else {
      // toggle 模式
      this._onClick = () => {
        if (this._recording) {
          this.stopRecording();
        } else {
          this.startRecording();
        }
      };
      this._button.addEventListener('click', this._onClick);
    }
  }

  // -----------------------------------------------------------------------
  // 状态更新
  // -----------------------------------------------------------------------
  _setStatus(text, state = 'idle') {
    this._statusEl.textContent = text;

    this._button.classList.remove('recording', 'transcribing');
    if (state === 'recording')    this._button.classList.add('recording');
    if (state === 'transcribing') this._button.classList.add('transcribing');

    if (this.onStatusChange) {
      try { this.onStatusChange(state, text); } catch (_) { /* ignore */ }
    }
  }

  // -----------------------------------------------------------------------
  // 录音控制
  // -----------------------------------------------------------------------
  async startRecording() {
    if (this._recording || this._transcribing) return;

    // 请求麦克风权限
    try {
      this._stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const msg = err.name === 'NotAllowedError'
        ? '麦克风权限被拒绝，请在浏览器设置中允许使用麦克风'
        : `无法访问麦克风: ${err.message}`;
      this._handleError(msg, err);
      return;
    }

    this._chunks = [];

    // 选择浏览器支持的 MIME 类型
    const mimeType = this._pickMimeType();

    try {
      this._mediaRecorder = new MediaRecorder(this._stream, {
        mimeType: mimeType,
      });
    } catch (err) {
      // 降级：不指定 mimeType
      try {
        this._mediaRecorder = new MediaRecorder(this._stream);
      } catch (err2) {
        this._handleError('浏览器不支持录音功能', err2);
        this._releaseStream();
        return;
      }
    }

    this._mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this._chunks.push(e.data);
      }
    };

    this._mediaRecorder.onstop = () => {
      this._onRecordingStop();
    };

    this._mediaRecorder.onerror = (e) => {
      this._handleError('录音出错', e.error || e);
      this._recording = false;
      this._setStatus('', 'idle');
      this._releaseStream();
    };

    this._mediaRecorder.start(250); // 每 250ms 一个 chunk
    this._recording = true;
    this._setStatus('录音中...', 'recording');
  }

  stopRecording() {
    if (!this._recording || !this._mediaRecorder) return;
    this._recording = false;
    try {
      this._mediaRecorder.stop();
    } catch (_) { /* 可能已经停止 */ }
  }

  // -----------------------------------------------------------------------
  // 录音结束 -> 上传转录
  // -----------------------------------------------------------------------
  async _onRecordingStop() {
    this._releaseStream();

    if (this._chunks.length === 0) {
      this._setStatus('未捕获到音频', 'idle');
      return;
    }

    // 组装 Blob
    const mimeType = this._mediaRecorder?.mimeType || 'audio/webm';
    const blob = new Blob(this._chunks, { type: mimeType });
    this._chunks = [];

    if (blob.size < 100) {
      this._setStatus('录音过短', 'idle');
      return;
    }

    // 上传
    this._transcribing = true;
    this._setStatus('转录中...', 'transcribing');

    try {
      const result = await this._upload(blob, mimeType);
      this._transcribing = false;

      if (result.text) {
        // 填充到 textarea
        if (this.textarea) {
          if (this.appendMode && this.textarea.value.trim().length > 0) {
            this.textarea.value += '\n' + result.text;
          } else {
            this.textarea.value = result.text;
          }
          // 触发 input 事件，确保框架（如 Vue/React）能捕获变化
          this.textarea.dispatchEvent(new Event('input', { bubbles: true }));
        }

        const langInfo = result.language ? ` [${result.language}]` : '';
        const durInfo  = result.duration ? ` ${result.duration}s` : '';
        this._setStatus(`完成${langInfo}${durInfo}`, 'idle');

        if (this.onResult) {
          try { this.onResult(result); } catch (_) { /* ignore */ }
        }
      } else {
        this._setStatus('未识别到语音', 'idle');
      }
    } catch (err) {
      this._transcribing = false;
      this._handleError(`转录失败: ${err.message}`, err);
    }
  }

  // -----------------------------------------------------------------------
  // 上传到后端
  // -----------------------------------------------------------------------
  async _upload(blob, mimeType) {
    // 根据 MIME 类型确定文件扩展名
    const extMap = {
      'audio/webm': 'webm',
      'audio/ogg':  'ogg',
      'audio/mp4':  'mp4',
      'audio/wav':  'wav',
      'audio/mpeg': 'mp3',
    };
    const ext = extMap[mimeType.split(';')[0]] || 'webm';
    const filename = `recording.${ext}`;

    const formData = new FormData();
    formData.append('file', blob, filename);

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      let detail = '';
      try {
        const body = await response.json();
        detail = body.detail || JSON.stringify(body);
      } catch (_) {
        detail = response.statusText;
      }
      throw new Error(`HTTP ${response.status}: ${detail}`);
    }

    return await response.json();
  }

  // -----------------------------------------------------------------------
  // MIME 类型选择
  // -----------------------------------------------------------------------
  _pickMimeType() {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
    ];
    for (const mt of candidates) {
      if (MediaRecorder.isTypeSupported(mt)) return mt;
    }
    return ''; // 让浏览器自己选
  }

  // -----------------------------------------------------------------------
  // 工具函数
  // -----------------------------------------------------------------------
  _releaseStream() {
    if (this._stream) {
      this._stream.getTracks().forEach((t) => t.stop());
      this._stream = null;
    }
  }

  _handleError(message, err) {
    console.error('[VoiceRecorder]', message, err);
    this._setStatus(message, 'idle');
    if (this.onError) {
      try { this.onError(message, err); } catch (_) { /* ignore */ }
    }
  }

  // -----------------------------------------------------------------------
  // 公开 API
  // -----------------------------------------------------------------------

  /** 当前是否正在录音 */
  get isRecording() {
    return this._recording;
  }

  /** 当前是否正在转录 */
  get isTranscribing() {
    return this._transcribing;
  }

  /** 获取按钮 DOM 元素（方便外部自定义样式） */
  get buttonElement() {
    return this._button;
  }

  /** 获取容器 DOM 元素 */
  get containerElement() {
    return this._container;
  }

  /** 销毁组件，释放资源 */
  destroy() {
    this.stopRecording();
    this._releaseStream();

    // 移除事件
    if (this._onClick) {
      this._button.removeEventListener('click', this._onClick);
    }
    if (this._onMouseDown) {
      this._button.removeEventListener('mousedown', this._onMouseDown);
      this._button.removeEventListener('mouseup',   this._onMouseUp);
      this._button.removeEventListener('mouseleave', this._onMouseUp);
      this._button.removeEventListener('touchstart', this._onMouseDown);
      this._button.removeEventListener('touchend',   this._onMouseUp);
    }

    // 移除 DOM
    if (this._container && this._container.parentNode) {
      this._container.parentNode.removeChild(this._container);
    }

    this._mediaRecorder = null;
    this._button = null;
    this._statusEl = null;
    this._container = null;
  }
}

export default VoiceRecorder;
