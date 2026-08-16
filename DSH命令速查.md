# DSH 命令速查

> 记录 DeepSeek Harness（dsh）日常使用的命令，按类别整理，方便查阅。
> 以后新学到的命令都会追加到本文档（见文末「新增命令记录」）。
> 最近更新：2026-08-16（安装 dsh-better-sidebar 插件）

---

## 目录

1. [插件管理（dsh plugin）](#1-插件管理dsh-plugin)
2. [启动与运行](#2-启动与运行)
3. [配置查看](#3-配置查看)
4. [环境与前提](#4-环境与前提)
5. [注意事项 / 常见问题](#5-注意事项--常见问题)
6. [Git / GitHub 同步](#6-git--github-同步)
7. [新增命令记录](#7-新增命令记录)

---

## 1. 插件管理（dsh plugin）

> 本质是把参数原样转发给 pnpm，在 profile 目录里执行包管理操作。
> **必须带 `--profile <name>`**，否则会报错。

| 用途 | 命令 |
| --- | --- |
| **安装**插件（npm 包或 git 仓库） | `dsh plugin --profile web add <包名或git规格>` |
| 安装 GitHub 仓库插件 | `dsh plugin --profile web add github:用户名/仓库名` |
| **更新**已安装插件 | `dsh plugin --profile web update` |
| **移除**插件 | `dsh plugin --profile web remove <包名>` |
| 查看某个包为何被依赖 | `dsh plugin --profile web why <包名>` |
| 其他 pnpm 操作（list / outdated 等） | `dsh plugin --profile web <任意pnpm参数>` |

**实例**（本次安装侧边栏插件）：

```bash
dsh plugin --profile web add github:omdsh-dev/DSH-better-sidebar
```

**要点**：

- 插件包必须声明 `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`，安装后才会自动加入 profile 的 bundle 层；普通依赖包只是装进 node_modules，不生效。
- 安装/更新成功（pnpm 退出码 0）后，会自动把 bundle 名称写入 profile 的 `package.json` → `dsh.profile.bundles`。
- 更新后，如果新版本新增了 `dsh.bundle` 声明，也会自动被激活；如果包被移除或声明没了，会自动离开层栈。
- **装完要重启 web 应用才生效**（bundle 层只在启动时组合，不会热加载）。

---

## 2. 启动与运行

| 用途 | 命令 |
| --- | --- |
| 启动 Web GUI | `dsh web`（等价于 `dsh --profile web`） |
| 一次性任务（headless） | `dsh --profile headless "任务描述"` |
| 带附加补丁启动 | `dsh --profile <name> --patch ./extra.yml` |
| 查看某 profile 应用自己的参数 | `dsh --profile web --help` |
| 查看 dsh 自身帮助与示例 | `dsh -h` |

---

## 3. 配置查看

| 用途 | 命令 |
| --- | --- |
| 打印完整组合树（含用户层与 patch 覆盖） | `dsh --profile web --dump-config` |
| 只打印 bundle 层（默认组合，无用户层） | `dsh --profile web --dump-default-config` |

---

## 4. 环境与前提

| 项目 | 值 |
| --- | --- |
| DSH 数据目录（DSH_HOME） | `C:\Users\erkem\.dsh` |
| profile 目录 | `%DSH_HOME%\profiles\<name>` |
| 插件管理前提 | 需要 `pnpm` 在系统 PATH 上 |
| 插件 bundle 层配置 | profile 的 `package.json` → `dsh.profile.bundles`（按顺序应用） |
| 构建脚本白名单 | profile 的 `pnpm-workspace.yaml` → `allowBuilds` |

---

## 5. 注意事项 / 常见问题

### git 托管的插件装不上，报 `ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED`

pnpm（≥10）默认拦截 git 依赖的 `prepare` 构建脚本。按报错提示，把**报错里给出的确切 key** 加到 profile 目录的 `pnpm-workspace.yaml`：

```yaml
allowBuilds:
  dsh-better-sidebar@https://codeload.github.com/omdsh-dev/DSH-better-sidebar/tar.gz/<commit>: true
```

然后重新执行安装命令。

### 传递依赖也报 `ERR_PNPM_IGNORED_BUILDS`

例如 `node-pty@1.1.0`（终端组件，需要原生二进制），同样加入 `allowBuilds`：

```yaml
allowBuilds:
  node-pty: true
```

pnpm 有时会直接把 `node-pty: set this to true or false` 这类占位符写进 yaml，改成 `true` 即可。

### 其他

- 装完 bundle 后**必须重启 web 应用**才会看到效果。
- 安装包时 pnpm 会要求写 profile 目录（在 `$DSH_HOME` 下），如果 shell 有文件沙箱限制需要放开对应目录的写权限。

---

## 6. Git / GitHub 同步

> 本工作区（P1-整理电脑文件）已初始化为 git 仓库，推送到 GitHub 账号 erkemumu。

| 用途 | 命令 |
| --- | --- |
| 查看状态 | \`git status\` |
| 暂存全部改动 | \`git add -A\` |
| 提交 | \`git commit -m "说明"\` |
| 推送 | \`git push\` |
| 拉取 | \`git pull\` |
| 改提交作者（登录后第一次用） | \`git commit --amend --reset-author\` |
| 创建 GitHub 仓库并推送 | \`gh repo create <仓库名> --private --source . --push\` |
| GitHub 登录 | \`gh auth login\`（设备码登录）或 \`gh auth login --with-token\`（贴 PAT） |

**日常同步三步走**：

\`\`\`bash
cd D:\AI\proj\P1-整理电脑文件
git add -A && git commit -m "改了什么" && git push
\`\`\`

**注意**：

- 首次推送前需要先建好 GitHub 仓库（浏览器新建，或 \`gh repo create\`）。
- fine-grained PAT 若没有「创建仓库」权限，会报 \`Resource not accessible (createRepository)\`——去 GitHub 新建仓库或换有权限的 token 即可。
- \`gui-restart-logs/\` 已加入 .gitignore，不会入库。
- **本机网络 22 端口不通，SSH 走 443**：已配置 \`~/.ssh/config\`（github.com → ssh.github.com:443），生成的密钥在 \`~/.ssh/id_ed25519(.pub)\`，公钥已加到 GitHub 账号。

---

## 7. 新增命令记录

| 日期 | 命令 | 用途 |
| --- | --- | --- |
| 2026-08-16 | `dsh plugin --profile web add github:omdsh-dev/DSH-better-sidebar` | 安装侧边栏插件（bundle 0.12.2，需 allowBuilds 放行 prepare 与 node-pty） |
| 2026-08-16 | `dsh plugin --profile web update` | 更新已装插件（记住这个，不再忘） |
| 2026-08-16 | `powershell -NoProfile -ExecutionPolicy Bypass -File restart-gui.ps1` | 一键重启 DSH Web GUI（dev 模式，验证 3080 端口） |
| 2026-08-16 | `git add -A && git commit -m \"说明\" && git push` | 工作区 git 日常三步同步 |
| 2026-08-16 | `gh auth login --with-token` | 用 PAT 登录 GitHub CLI（token 存入系统钥匙串） |
| 2026-08-16 | `gh repo create <名> --private --source . --push` | 创建私有 GitHub 仓库并推送当前目录 |
| 2026-08-16 | `ssh-keygen -t ed25519` + 公钥贴到 github.com/settings/ssh/new | 生成 SSH 密钥用于 GitHub 推送（本机 22 端口不通，改走 443） |
| 2026-08-16 | `git push -u origin main` | 推送 main 分支到 GitHub（origin = git@github.com:erkemumu/Organize-computer-files.git） |
