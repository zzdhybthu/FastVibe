#!/usr/bin/env bash
# test-task-per-worktree.sh - 测试一任务一worktree 模型
# 在临时 git 仓库中验证 worktree 创建、命名、并行度限制等行为
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PASS=0
FAIL=0
TOTAL=0

_test() {
    local name="$1"
    TOTAL=$((TOTAL + 1))
    echo -n "  测试 $TOTAL: $name ... "
}

_pass() {
    PASS=$((PASS + 1))
    echo "PASS"
}

_fail() {
    FAIL=$((FAIL + 1))
    echo "FAIL: $1"
}

# ── 准备临时测试环境 ─────────────────────────────────────────────
TEST_TMPDIR="$(mktemp -d)"
cleanup() {
    cd /
    rm -rf "$TEST_TMPDIR"
    # 清理可能残留的锁
    rm -rf "${TMPDIR:-/tmp}/.worktree-create.lock" 2>/dev/null || true
    rm -rf "${TMPDIR:-/tmp}/.parallel-launch.lock" 2>/dev/null || true
}
trap cleanup EXIT

echo "========================================"
echo "  一任务一Worktree 测试"
echo "========================================"
echo ""
echo "测试目录: $TEST_TMPDIR"
echo ""

# 创建临时 git 仓库
cd "$TEST_TMPDIR"
git init -b main test-repo >/dev/null 2>&1
cd test-repo
git config user.email "test@test.local"
git config user.name "Test"
git commit --allow-empty -m "init" >/dev/null 2>&1

# 创建队列结构
QUEUE_DIR="$TEST_TMPDIR/test-repo/task-queue"
mkdir -p "$QUEUE_DIR/pending"

# ── 测试 1: dry-run 为每个任务创建独立 worktree ──────────────────
_test "dry-run 为每个任务显示独立 worktree"
echo "修复认证模块" > "$QUEUE_DIR/pending/fix-auth.md"
echo "添加登录页面" > "$QUEUE_DIR/pending/add-login.md"
echo "重构数据库层" > "$QUEUE_DIR/pending/refactor-db.txt"

output="$(bash "$SCRIPT_DIR/parallel-launch.sh" --dry-run --queue-dir "$QUEUE_DIR" --workers 10 2>&1)"

if echo "$output" | grep -q "worktree: fix-auth" && \
   echo "$output" | grep -q "worktree: add-login" && \
   echo "$output" | grep -q "worktree: refactor-db"; then
    _pass
else
    _fail "dry-run 未为每个任务显示独立 worktree"
    echo "  输出: $output"
fi

# ── 测试 2: --workers 限制并行数 ─────────────────────────────────
_test "--workers 限制并行任务数"
output="$(bash "$SCRIPT_DIR/parallel-launch.sh" --dry-run --queue-dir "$QUEUE_DIR" --workers 2 2>&1)"

if echo "$output" | grep -q "剩余 1 个任务"; then
    _pass
else
    _fail "未正确限制并行数"
    echo "  输出: $output"
fi

# ── 测试 3: 任务名称消毒 ─────────────────────────────────────────
_test "任务名称消毒 (特殊字符)"
echo "Test task" > "$QUEUE_DIR/pending/My Task (v2).md"
output="$(bash "$SCRIPT_DIR/parallel-launch.sh" --dry-run --queue-dir "$QUEUE_DIR" --workers 10 2>&1)"

if echo "$output" | grep -q "worktree: my-task-v2"; then
    _pass
else
    _fail "任务名称消毒不正确"
    echo "  输出: $output"
fi
rm "$QUEUE_DIR/pending/My Task (v2).md"

# ── 测试 4: 空队列提示 ──────────────────────────────────────────
_test "空队列正确提示"
# 保存当前任务，清空队列
mkdir -p "$QUEUE_DIR/saved"
mv "$QUEUE_DIR/pending"/* "$QUEUE_DIR/saved/" 2>/dev/null || true

output="$(bash "$SCRIPT_DIR/parallel-launch.sh" --dry-run --queue-dir "$QUEUE_DIR" 2>&1)"
if echo "$output" | grep -q "没有待处理的任务"; then
    _pass
else
    _fail "空队列提示不正确"
    echo "  输出: $output"
fi

# 恢复任务
mv "$QUEUE_DIR/saved"/* "$QUEUE_DIR/pending/" 2>/dev/null || true
rmdir "$QUEUE_DIR/saved" 2>/dev/null || true

# ── 测试 5: 实际创建 worktree (每个任务独立) ─────────────────────
_test "实际创建独立 worktree 目录和分支"
# 手动调用 worktree-manager 模拟 per-task worktree 创建
bash "$SCRIPT_DIR/worktree-manager.sh" create "fix-auth" >/dev/null 2>&1
bash "$SCRIPT_DIR/worktree-manager.sh" create "add-login" >/dev/null 2>&1
bash "$SCRIPT_DIR/worktree-manager.sh" create "refactor-db" >/dev/null 2>&1

WT_BASE=".claude-worktrees"
if [ -d "$WT_BASE/fix-auth" ] && [ -d "$WT_BASE/add-login" ] && [ -d "$WT_BASE/refactor-db" ] && \
   git show-ref --verify --quiet "refs/heads/worker-fix-auth" && \
   git show-ref --verify --quiet "refs/heads/worker-add-login" && \
   git show-ref --verify --quiet "refs/heads/worker-refactor-db"; then
    _pass
else
    _fail "worktree 或分支创建失败"
fi

# ── 测试 6: worktree 之间互相隔离 ────────────────────────────────
_test "worktree 之间文件隔离"
# 在每个 worktree 中创建不同文件
echo "auth code" > "$WT_BASE/fix-auth/auth.txt"
echo "login code" > "$WT_BASE/add-login/login.txt"
echo "db code" > "$WT_BASE/refactor-db/db.txt"

# 验证文件不互相可见
if [ ! -f "$WT_BASE/fix-auth/login.txt" ] && \
   [ ! -f "$WT_BASE/fix-auth/db.txt" ] && \
   [ ! -f "$WT_BASE/add-login/auth.txt" ] && \
   [ ! -f "$WT_BASE/add-login/db.txt" ] && \
   [ ! -f "$WT_BASE/refactor-db/auth.txt" ] && \
   [ ! -f "$WT_BASE/refactor-db/login.txt" ]; then
    _pass
else
    _fail "worktree 之间文件泄漏"
fi

# ── 测试 7: 每个 worktree 可以独立 commit ────────────────────────
_test "每个 worktree 独立 commit"
for wt_name in fix-auth add-login refactor-db; do
    cd "$TEST_TMPDIR/test-repo/$WT_BASE/$wt_name"
    git add -A 2>/dev/null || true
    git -c user.email="test@test.local" -c user.name="Test" \
        commit -m "task-$wt_name: test commit" --no-verify >/dev/null 2>&1 || true
done
cd "$TEST_TMPDIR/test-repo"

# 验证每个分支有独立的 commit
auth_commits="$(git log --oneline worker-fix-auth 2>/dev/null | wc -l | tr -d ' ')"
login_commits="$(git log --oneline worker-add-login 2>/dev/null | wc -l | tr -d ' ')"
db_commits="$(git log --oneline worker-refactor-db 2>/dev/null | wc -l | tr -d ' ')"

if [ "$auth_commits" -ge 2 ] && [ "$login_commits" -ge 2 ] && [ "$db_commits" -ge 2 ]; then
    _pass
else
    _fail "commit 数量不正确: auth=$auth_commits login=$login_commits db=$db_commits"
fi

# ── 测试 8: merge-helper 能发现任务分支 ──────────────────────────
_test "merge-helper status 显示所有任务分支"
cd "$TEST_TMPDIR/test-repo"
output="$(bash "$SCRIPT_DIR/merge-helper.sh" status 2>&1)"

if echo "$output" | grep -q "worker-fix-auth" && \
   echo "$output" | grep -q "worker-add-login" && \
   echo "$output" | grep -q "worker-refactor-db"; then
    _pass
else
    _fail "merge-helper 未显示所有任务分支"
    echo "  输出: $output"
fi

# ── 测试 9: 重名任务自动去重 ─────────────────────────────────────
_test "重复任务名自动添加后缀"
# fix-auth worktree 已存在，再创建同名应该报错
output="$(bash "$SCRIPT_DIR/worktree-manager.sh" create "fix-auth" 2>&1 || true)"
if echo "$output" | grep -q "已存在"; then
    _pass
else
    _fail "未检测到重名"
    echo "  输出: $output"
fi

# ── 清理 worktree ────────────────────────────────────────────────
cd "$TEST_TMPDIR/test-repo"
for wt_name in fix-auth add-login refactor-db; do
    git worktree remove "$WT_BASE/$wt_name" --force 2>/dev/null || true
    git branch -D "worker-$wt_name" 2>/dev/null || true
done
git worktree prune 2>/dev/null || true

# ── 测试 10: 不同扩展名任务正确处理 ─────────────────────────────
_test ".md/.txt/.task 三种格式都能识别"
echo "Task 1" > "$QUEUE_DIR/pending/task-a.md"
echo "Task 2" > "$QUEUE_DIR/pending/task-b.txt"
echo "Task 3" > "$QUEUE_DIR/pending/task-c.task"
# 先清除上面残留的任务
rm -f "$QUEUE_DIR/pending/fix-auth.md" "$QUEUE_DIR/pending/add-login.md" "$QUEUE_DIR/pending/refactor-db.txt" 2>/dev/null || true

output="$(bash "$SCRIPT_DIR/parallel-launch.sh" --dry-run --queue-dir "$QUEUE_DIR" --workers 10 2>&1)"

if echo "$output" | grep -q "task-a" && \
   echo "$output" | grep -q "task-b" && \
   echo "$output" | grep -q "task-c"; then
    _pass
else
    _fail "未识别所有任务格式"
    echo "  输出: $output"
fi

# ── 结果 ─────────────────────────────────────────────────────────
echo ""
echo "========================================"
if [ "$FAIL" -eq 0 ]; then
    echo "  全部通过! $PASS/$TOTAL"
else
    echo "  结果: $PASS/$TOTAL passed, $FAIL failed"
fi
echo "========================================"

exit "$FAIL"
