# 设计说明（verify-zh-localization）

## 一、验收分层

| 层 | 手段 | 通过标准 |
| --- | --- | --- |
| L1 产物结构 | 文件系统枚举 | `Void.exe` / `product.json` / NLS 产物齐备 |
| L2 配置字段 | JSON 解析 | `defaultLocale === 'zh-cn'` |
| L3 翻译内容 | 字符串匹配 | nls.messages 命中核心中文关键字 ≥ 4 |
| L4 语言包存在 | 目录枚举 + package.json 核对 | `zh-hans` 语言包存在且 contributes.localizations 含 `zh-cn` |
| L5 运行时加载 | Void.exe 启动 + 日志扫描 | 启动日志显示选择 `zh-cn` locale |

L1~L4 属于**静态验收**，L5 属于**动态验收**。本会话**无法截屏 UI**，因此 L5 通过日志间接验证，而不是目测菜单栏。

## 二、脚本化验收

为保证可复现，所有验收步骤封装为一次性 Node 脚本：

```
build/lib/verify-zh-localization.js
```

该脚本完成：

1. L1：`fs.existsSync` 枚举关键路径。
2. L2：`JSON.parse` `product.json`，打印目标字段。
3. L3：`fs.readFileSync` nls.messages，`includes` 匹配中文关键字。
4. L4：`fs.readdirSync` `resources/app/extensions/`，匹配 `zh-hans` 目录并读取其 `package.json`。
5. 输出一份 JSON 汇总结果到 `文档/temp-中文化最终验收记录.json`。

L5 动态部分单独执行 `child_process.spawn('Void.exe', ['--user-data-dir', tmp, '--new-window'])`，短暂运行后 `taskkill`，再扫描日志。

## 三、用干净 user-data-dir 的意义

VSCode / Void 的 locale 决策过程大致为：

1. 读取 `argv.json`（位于 `user-data-dir`）的 `locale` 字段。
2. 若未设置，读取命令行 `--locale`。
3. 若仍未设置，读取系统 `osLocale`（Windows 区域设置）。
4. 最终由 `nls.ts` 加载对应 `nls.messages.<locale>.json`。

使用**干净 `user-data-dir`** 可以跳过第 1 步，让我们观察到“纯产物侧”默认行为：

- 如果 `product.json.defaultLocale = zh-cn` 被正确注入到 NLS 逻辑，则即便系统 locale 是 `en-US`，也应回退到 `zh-cn`。
- 如果系统 locale 是 `zh-CN`（本机大概率如此），则 L5 只能证明“系统 locale 主导生效”，无法区分是否默认中文。
- 为严谨，动态验收额外跑一次 `--locale=en` 强制英文，如果界面仍能按 `product.json.defaultLocale` 回退到中文，才是**真正的默认中文生效**。

## 四、关键依据

根据上游 `文档/temp-三段式中文方案编码实施与验收记录.md`：

- `src/vs/base/node/nls.ts` 与 `src/vs/platform/windows/electron-main/windowImpl.ts` 已被改造为 `osLocale` 失败时回退到 `zh-cn`。
- `build/npm/validate-localization-packaging.mjs` 校验打包前内建扩展已包含 `vscode-language-pack-zh-hans`。
- `product.json.defaultLocale` 需等于 `zh-cn`。

本 change 的静态验收正好逐条对这些契约取证。

## 五、时间盒

- L1~L4 静态：5 分钟。
- L5 动态：5 分钟（含启动/关闭）。
- 归档：5 分钟。
- 超出 30 分钟或发现任何一层失败，立刻停下并单独开一个修复 change。

## 六、风险与应对

- **Void.exe 无头启动可能没有 `--new-window` 参数或与 `user-data-dir` 冲突**：改用 `--wait`（若支持）或仅启动主进程后立即退出。
- **Windows `taskkill` 把其他 Void 进程一起干掉**：改用 PID 精确定位（`process.spawn` 返回的 pid）。
- **日志路径变化**：logs 目录在不同版本可能位于 `user-data-dir\logs\<timestamp>\` 深层；扫描时递归查找。
