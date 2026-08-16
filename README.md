# P1-整理电脑文件

个人工作区：日常整理电脑文件时用到的工具与命令记录。

## 内容

- **DSH命令速查.md** — DeepSeek Harness（dsh）常用命令分类速查，含插件管理 / 启动运行 / 配置查看 / 常见问题；新学到的命令会持续追加到「新增命令记录」。
- **restart-gui.ps1** — 一键重启 DSH Web GUI 的脚本（停止 3080 端口旧进程 → 以 dev 模式重新启动 → 验证端口）。运行时日志输出到 `gui-restart-logs/`（不入库）。

## 用法

```powershell
# 重启 DSH Web GUI
powershell -NoProfile -ExecutionPolicy Bypass -File "D:\AI\proj\P1-整理电脑文件\restart-gui.ps1"
```
