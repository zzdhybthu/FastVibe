# Android 快捷方式配置指南

通过 Android 手机远程访问 VibeCoding 语音服务——在主屏幕上创建一键直达的 PWA 图标。

---

## 1. 安装 Termux

Termux 是 Android 上的终端模拟器，用于建立 SSH 隧道。

### 安装步骤

1. **从 F-Droid 安装**（推荐，Google Play 版本已过时）:
   - 打开浏览器访问 https://f-droid.org
   - 搜索 "Termux" 并安装
   - 或直接访问: https://f-droid.org/packages/com.termux/

2. **首次启动配置**:
   ```bash
   # 更新包管理器
   pkg update && pkg upgrade -y

   # 安装 OpenSSH
   pkg install openssh -y
   ```

3. **设置 SSH 密钥**（免密码登录）:
   ```bash
   # 生成密钥对
   ssh-keygen -t ed25519 -C "android-termux"

   # 将公钥复制到服务器
   # 方法 1: 手动复制
   cat ~/.ssh/id_ed25519.pub
   # 在服务器上将输出追加到 ~/.ssh/authorized_keys

   # 方法 2: 如果服务器已可访问
   ssh-copy-id user@your-server-ip
   ```

---

## 2. SSH 隧道连接

SSH 隧道将服务器的 8420 端口映射到手机本地，使浏览器可以通过 `localhost:8420` 访问服务。

### 基本命令

```bash
ssh -L 8420:localhost:8420 user@your-server-ip
```

### 参数说明

| 参数 | 含义 |
|------|------|
| `-L 8420:localhost:8420` | 本地 8420 端口 -> 服务器 localhost:8420 |
| `user` | 服务器用户名 |
| `your-server-ip` | 服务器 IP 或域名 |

### 后台运行（推荐）

```bash
# -f: 后台运行  -N: 不执行远程命令  -T: 不分配终端
ssh -f -N -T -L 8420:localhost:8420 user@your-server-ip
```

### 保持连接不断开

```bash
# 在 Termux 中编辑 SSH 配置
mkdir -p ~/.ssh
cat >> ~/.ssh/config << 'EOF'
Host vibe-server
    HostName your-server-ip
    User your-username
    LocalForward 8420 localhost:8420
    ServerAliveInterval 30
    ServerAliveCountMax 5
    TCPKeepAlive yes
EOF

# 之后只需运行:
ssh -f -N -T vibe-server
```

### 快速连接脚本

在 Termux 中创建一个便捷脚本:

```bash
cat > ~/vibe-tunnel.sh << 'SCRIPT'
#!/data/data/com.termux/files/usr/bin/bash
# VibeCoding SSH 隧道脚本

SERVER="user@your-server-ip"
PORT=8420

# 检查隧道是否已在运行
if pgrep -f "ssh.*-L.*${PORT}" > /dev/null; then
    echo "隧道已在运行"
else
    echo "正在建立 SSH 隧道..."
    ssh -f -N -T -L ${PORT}:localhost:${PORT} ${SERVER}
    if [ $? -eq 0 ]; then
        echo "隧道建立成功! 访问 http://localhost:${PORT}"
    else
        echo "隧道建立失败"
        exit 1
    fi
fi
SCRIPT
chmod +x ~/vibe-tunnel.sh
```

运行: `~/vibe-tunnel.sh`

---

## 3. Chrome 添加到主屏幕（创建 PWA）

将网页添加为主屏幕图标，获得接近原生 App 的体验。

### 前提条件

- SSH 隧道已建立
- Chrome 浏览器可以访问 `http://localhost:8420`

### 步骤

1. **打开 Chrome**，访问 `http://localhost:8420`
2. 确认页面正常加载
3. 点击 Chrome **右上角三点菜单** (...)
4. 选择 **"添加到主屏幕"** (Add to Home screen)
5. 输入名称，例如 "VibeCoding"
6. 点击 **"添加"**
7. 主屏幕上会出现一个图标

### 注意事项

- PWA 模式下地址栏会隐藏，更像原生 App
- 如果服务端配置了 `manifest.json`，PWA 体验会更好
- 需要 SSH 隧道在后台保持运行

### 可选: 添加 Web App Manifest

在服务端项目中添加 `manifest.json`（提升 PWA 体验）:

```json
{
  "name": "VibeCoding",
  "short_name": "VibeCoding",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#1a1a2e",
  "theme_color": "#e94560",
  "icons": [
    {
      "src": "/static/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/static/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

---

## 4. Tasker 自动化方案（可选）

使用 Tasker 实现：打开 VibeCoding 时自动建立 SSH 隧道。

### 安装

- Google Play 搜索 "Tasker" (付费 App)
- 同时安装免费插件 "Termux:Tasker"（F-Droid）

### Termux 端配置

```bash
# 允许 Tasker 访问 Termux
# 在 Termux 中执行:
mkdir -p ~/.termux/tasker

# 创建隧道脚本
cat > ~/.termux/tasker/vibe-tunnel.sh << 'SCRIPT'
#!/data/data/com.termux/files/usr/bin/bash

SERVER="user@your-server-ip"
PORT=8420

# 杀掉旧的隧道进程
pkill -f "ssh.*-L.*${PORT}" 2>/dev/null
sleep 1

# 建立新隧道
ssh -f -N -T \
    -o ServerAliveInterval=30 \
    -o ServerAliveCountMax=5 \
    -o ConnectTimeout=10 \
    -L ${PORT}:localhost:${PORT} \
    ${SERVER}

exit $?
SCRIPT
chmod +x ~/.termux/tasker/vibe-tunnel.sh
```

### Tasker 配置

#### Profile: 打开 VibeCoding 时

1. **新建 Profile** -> **Application** -> 选择 Chrome
2. **新建 Task: "Start Tunnel"**
   - Action 1: Plugin -> Termux:Tasker
     - Configuration: `~/.termux/tasker/vibe-tunnel.sh`
     - 勾选 "Wait for result"
   - Action 2: Wait 3 seconds
   - Action 3: Browse URL -> `http://localhost:8420`

#### Profile: 离开 VibeCoding 时（可选，省电）

1. 使用上面 Profile 的 **Exit Task**
2. **新建 Task: "Stop Tunnel"**
   - Action 1: Plugin -> Termux:Tasker
     - Script: `pkill -f "ssh.*-L.*8420"`

### 一键 Widget

1. 在 Tasker 中创建上面的 Task
2. 长按桌面 -> Widgets -> Tasker -> Task Shortcut
3. 选择 "Start Tunnel" Task
4. 自定义图标和名称

---

## 5. 故障排除

### SSH 隧道问题

| 症状 | 原因 | 解决方案 |
|------|------|----------|
| `Connection refused` | 服务器 SSH 未启动 | 确认服务器 sshd 正在运行 |
| `Connection timed out` | 网络不通或防火墙 | 检查网络，确认服务器端口 22 开放 |
| `Permission denied` | 密钥/密码错误 | 检查 SSH 密钥配置 |
| `Address already in use` | 端口被占用 | `pkill -f "ssh.*-L.*8420"` 后重试 |
| 隧道建立但无法访问 | 服务端未监听 | 确认服务器上 8420 端口有服务运行 |

### 检查隧道状态

```bash
# 查看隧道进程
ps aux | grep "ssh.*-L.*8420"

# 测试连接
curl -s http://localhost:8420/api/voice/health

# 杀掉所有隧道
pkill -f "ssh.*-L.*8420"
```

### 麦克风权限问题

| 症状 | 解决方案 |
|------|----------|
| 浏览器提示 "未找到麦克风" | 检查 Android 系统设置中 Chrome 的麦克风权限 |
| 录音无声音 | 确认没有其他 App 占用麦克风 |
| HTTPS 要求 | `localhost` 不需要 HTTPS；如果用 IP 访问则需要 |

### Chrome PWA 问题

| 症状 | 解决方案 |
|------|----------|
| 没有 "添加到主屏幕" 选项 | 确认使用 Chrome（非其他浏览器），且页面可正常加载 |
| PWA 打开后白屏 | SSH 隧道可能断了，重新建立隧道 |
| 页面加载慢 | 检查网络状况和服务器负载 |

### Termux 特定问题

```bash
# Termux 权限修复
termux-setup-storage

# 如果 pkg 安装失败
termux-change-repo

# 唤醒锁（防止后台被杀）
termux-wake-lock
```

### 实用调试命令

```bash
# 在 Termux 中测试服务器连通性
ping -c 3 your-server-ip

# 详细 SSH 连接日志
ssh -v -L 8420:localhost:8420 user@your-server-ip

# 检查本地端口是否监听
netstat -tlnp 2>/dev/null | grep 8420 || ss -tlnp | grep 8420
```

---

## 完整工作流程总结

```
1. 手机打开 Termux
2. 运行 ~/vibe-tunnel.sh（或 Tasker 自动执行）
3. 点击主屏幕上的 VibeCoding 图标
4. 开始使用语音输入功能
```

如果使用 Tasker 自动化，流程简化为：

```
1. 点击桌面 Widget 或打开 VibeCoding 图标
2. 自动建立隧道并跳转到页面
3. 直接使用
```
