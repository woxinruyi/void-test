# 中文化最终验收（verify-zh-localization）

## 背景

在前序两个 change 中：

- `introduce-openspec-zh` 引入 OpenSpec 并配置中文产出物。
- `build-latest-win32-exe` 完成了基于最新代码的 Windows 本地 EXE 构建，产物 `.build/win32-x64/user-setup/VSCodeSetup.exe`（108.90 MB，SHA-256 `2cab5a...3284e`）。

此前“三段式中文方案”追踪文档 `文档/temp-三段式中文方案编码实施与验收记录.md` 提出要在**干净 `user-data-dir`** 下验证原生 Workbench 中文化是否生效（菜单、命令面板、设置页、资源管理器）。本 change 用于执行该验收。

## 目标

- **静态验收**：核对构建产物内部结构确认中文化要素齐备：
  - `resources/app/product.json` 的 `defaultLocale`（或等价字段）指向简体中文。
  - 内建扩展中包含 `vscode-language-pack-zh-hans` 或同等语言包。
  - `out/nls.messages.json` / `nls.keys.json` 存在且非空。
  - 运行时 NLS 逻辑（`nls.ts`、`windowImpl.ts` 的相关分支）已包含默认回退到 zh-cn 的路径。
- **动态验收**：用全新临时 `user-data-dir` 启动 Void.exe，在不指定 `--locale` 的前提下观察：
  - 启动日志中 NLS 选择的 locale 为 `zh-cn`。
  - 主窗口菜单、命令面板初始 placeholder、资源管理器视图标题、设置页标题为简体中文。
- **结论性记录**：将静态与动态验收的每一项结论写入 `文档/temp-中文化最终验收记录.md`，明确“通过 / 部分通过 / 不通过”。

## 非目标（Non-goals）

- 不修改任何运行时 NLS 代码（若发现回退问题，另起 change 修复）。
- 不重新打包 Setup EXE；本轮仅验收现有产物。
- 不进行系统级安装（`VSCodeSetup.exe` 双击），优先用 `VSCode-win32-x64/` 免安装目录中的 `Void.exe` 做动态验收，避免污染用户环境。
- 不覆盖多语言完整支持（仅验证默认中文是否生效）。

## 方案

按下列 5 步执行：

1. **枚举构建产物根目录**（`../VSCode-win32-x64`）下的关键文件，列出 `product.json`、`resources/app/out/nls.messages.json`、语言包扩展目录、Electron 主进程入口。
2. **静态核对 product.json 与语言包**：
   - `defaultLocale` / `locale` 字段必须为 `zh-cn`。
   - `resources/app/extensions/` 下存在 `vscode-language-pack-zh-hans`（或仓库自定义的等价语言包）。
3. **静态核对 NLS 产物**：
   - `out/nls.messages.json` 包含简体中文字符串（至少命中 “文件/编辑/视图/终端/帮助” 等菜单关键字）。
4. **动态启动验收**：
   - 创建临时 `user-data-dir`（`%TEMP%\void-zh-verify-<timestamp>`）。
   - 以 `Void.exe --user-data-dir=<...> --disable-gpu --new-window` 启动 3~5 秒后关闭（仅验证 NLS 选择路径与标题栏不崩溃）。
   - 收集启动日志 `logs/` 中的 NLS 选择记录。
5. **归档**：结论写入 `文档/temp-中文化最终验收记录.md`，同时在本 change 的 `README.md` 或 proposal.md 结尾追加“验收结论”小节。

## 影响

- 不修改代码、不修改产物、不安装软件。
- 仅创建临时 `user-data-dir` 与 `logs/`，验收后可清理。
- 成功后，“三段式中文方案”的第二段（本地 built/package 验证）正式闭环。

## 风险

- **免安装目录与 Setup EXE 内容差异**：如果 Inno Setup 打包过程中有二次改动（例如 `product.json` 替换），免安装目录核对结果可能与实际安装产物不完全一致。缓解：同时核对 `.build/win32-x64/user-setup/product.json`（gulpfile 写入）。
- **GUI 观察局限**：无法在本会话中真正截屏 UI；用启动日志与 NLS 配置核对替代。
