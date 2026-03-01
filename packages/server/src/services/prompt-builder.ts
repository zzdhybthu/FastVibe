import type { Task, Repo } from '@vibecoding/shared';

/**
 * Slugify a string for use in branch names.
 * Converts to lowercase, replaces non-alphanumeric with hyphens, removes leading/trailing hyphens.
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40); // limit length for filesystem safety
}

/**
 * Build the branch name for a task's worktree.
 * Format: task-{first 8 chars of id}-{slugified title}
 */
export function buildBranchName(task: Task): string {
  const idPrefix = task.id.slice(0, 8);
  const titleSlug = task.title ? slugify(task.title) : 'untitled';
  return `task-${idPrefix}-${titleSlug}`;
}

/**
 * Build the full CC prompt for a task.
 * Includes instructions for worktree management, task execution, and cleanup.
 */
export function buildPrompt(task: Task, repo: Repo): string {
  const branchName = buildBranchName(task);
  const worktreeDir = `.claude-worktrees/${branchName}`;
  const repoDir = repo.path;

  return `你是一个自动化编码助手，在 Git 仓库中执行指定任务。请严格按照以下步骤操作：

## 步骤 1: 创建 worktree
在仓库根目录 (当前目录) 下创建一个新的 git worktree:
\`\`\`bash
git worktree add ${worktreeDir} -b ${branchName} ${repo.mainBranch}
\`\`\`

## 步骤 2: 进入 worktree
\`\`\`bash
cd ${worktreeDir}
\`\`\`

## 步骤 2.5: Worktree 环境准备
Git worktree 不会自动复制 .gitignore 中列出的文件。请遵循以下规则:

### 依赖安装
- **必须重新安装依赖**，不要从主 worktree 复制 node_modules 或 .venv
- 有 package.json → \`pnpm install\`（优先）或 \`npm install\`
- 有 requirements.txt/pyproject.toml → \`uv sync\` 或 \`uv pip install -r requirements.txt\`

### 必要的配置文件
- .env 文件：从主 worktree 创建符号链接 \`ln -s ${repoDir}/.env .env\`
- 数据文件/大型资产目录：同样使用符号链接
- **绝对不要修改符号链接指向的源文件内容**

### 工具版本
- 如项目有 .node-version/.nvmrc → \`fnm use\`
- 如项目需要特定 Python 版本 → \`uv python pin\`

## 步骤 3: 执行任务
任务描述:
---
${task.prompt}
---

请完成上述任务。在开发过程中:
- 如果需要用户确认或选择，使用 ask_user MCP 工具
- 写高质量的代码，遵循仓库现有的代码风格
- 确保代码可以正常编译/运行

## 步骤 4: 代码质量检查
如果仓库有 lint/format 配置 (如 ESLint, Prettier, Biome 等)，运行相应的格式化和检查命令:
\`\`\`bash
# 检查 package.json 中的 lint/format 脚本并运行
# 例如: pnpm run lint --fix, pnpm run format 等
\`\`\`

## 步骤 5: 提交代码
\`\`\`bash
git add -A
git commit -m "feat(${branchName}): 简洁描述改动内容"
\`\`\`
commit message 格式: \`类型(范围): 描述\`，类型可以是 feat/fix/refactor/docs/test/chore 等。

## 步骤 6: 同步远程最新内容
\`\`\`bash
cd ${repoDir}  # 回到仓库根目录
git checkout ${repo.mainBranch}
git pull origin ${repo.mainBranch}
\`\`\`

## 步骤 7: Rebase 工作分支
\`\`\`bash
cd ${worktreeDir}  # 回到 worktree
git rebase ${repo.mainBranch}
\`\`\`

如果 rebase 有冲突:
1. 逐个解决冲突文件
2. 如果无法自动解决，使用 ask_user 工具询问用户如何处理
3. 解决后 \`git add <文件>\` 然后 \`git rebase --continue\`
4. 如果冲突过于复杂，可 \`git rebase --abort\` 并使用 ask_user 告知用户

## 步骤 8: 合并到主分支
\`\`\`bash
cd ${repoDir}  # 回到仓库根目录
git checkout ${repo.mainBranch}
git merge ${branchName} --no-ff -m "merge(${branchName}): 合并任务分支"
\`\`\`

## 步骤 9: 清理并推送
\`\`\`bash
git worktree remove ${worktreeDir} --force
git branch -d ${branchName}
git push origin ${repo.mainBranch}
\`\`\`

## 步骤 10: 记录进展
如果仓库根目录有 PROGRESS.md 文件，在其中记录:
- 完成的任务简述
- 关键改动和 commit id
- 注意事项

## 失败处理
如果任务无法完成，请清楚地说明失败原因，包括:
- 具体的错误信息
- 尝试过的解决方案
- 建议的后续步骤
`;
}
