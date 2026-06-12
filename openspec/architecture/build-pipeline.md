# 构建流程

## 概述

Void 基于 VS Code 的 Gulp 构建系统，分为编译、打包、安装程序三个阶段。

## 阶段 1：TypeScript 编译

```bash
node ./node_modules/gulp/bin/gulp.js compile-client
```

| 子步骤 | 耗时 | 说明 |
|--------|------|------|
| `clean-out` | ~3-8s | 删除 `out/` 目录 |
| `compile-api-proposal-names` | <1s | API 提案名称编译 |
| `compile-src` | 5-7 min | 全量 TypeScript 编译 |

**成功标准：** `Finished compilation with 0 errors`

**快速类型检查（不生成输出）：**
```bash
npx tsc --noEmit --project src/tsconfig.json
```

## 阶段 2：打包构建

```bash
# 先关闭运行中的 Void
Get-Process -Name 'Void' -ErrorAction SilentlyContinue | Stop-Process -Force

# 清理旧构建
Remove-Item 'I:\自动化执行\VSCode-win32-x64' -Recurse -Force -ErrorAction SilentlyContinue

# 打包
node ./node_modules/gulp/bin/gulp.js vscode-win32-x64
```

**构建输出：** `I:\自动化执行\VSCode-win32-x64\`

**后置步骤（必须）：**
```powershell
New-Item -ItemType Directory -Path 'I:\自动化执行\VSCode-win32-x64\tools' -Force
Copy-Item 'build\win32\inno_updater.exe' 'I:\自动化执行\VSCode-win32-x64\tools\'
Copy-Item 'build\win32\vcruntime140.dll' 'I:\自动化执行\VSCode-win32-x64\tools\'
```

## 阶段 3：安装程序（可选）

```bash
node ./node_modules/gulp/bin/gulp.js vscode-win32-x64-user-setup
```

**输出：** `I:\自动化执行\void-main\.build\win32-x64\user-setup\VoidUserSetup-x64.exe`

## 启动测试

```powershell
Start-Process 'I:\自动化执行\VSCode-win32-x64\Void.exe'
```

## 运行单元测试（mocha / node 环境）

Void 的 mocha 测试位于 `src/vs/workbench/contrib/void/test/common/*.test.ts`，但 **mocha runner 从 `out/` 目录加载 `.test.js`**（见 `test/unit/node/index.js:57`：`TEST_GLOB = '**/test/**/*.test.js'`）。因此必须**先编译 src→out**，才能跑测试。

### 前置：确保 out/ 已编译

判断 out/ 是否已构建：

```powershell
Test-Path "out/vs/workbench/contrib/void/test/common/toolValidation.test.js"
```

如返回 `False`，必须先执行**阶段 1 TypeScript 编译**（5-7 分钟），或后台跑 `npm run watch-client` 让它增量编译。

### 运行测试命令

```powershell
# 运行某个 suite（推荐：按 change 隔离）
npm run test-node -- --grep "enhance-agent-prompt-and-context"

# 运行全部 Void 单元测试
npm run test-node -- --grep "Void"

# 运行所有 mocha 单元测试
npm run test-node
```

**通过标准：** mocha 报告全部 PASS，无 disposable 泄露，无 5000ms 超时。

### 增量开发建议

如果频繁修改 `src/` 下文件并跑测试，**强烈推荐**长开 watch-client：

```powershell
# 首次启动，监听文件变化，自动增量编译
npm run watch-client

# 或后台守护方式（不占用终端窗口）
npm run watch-clientd
```

watch-client 启动时仍需 1-2 分钟首次全量编译，但之后每次修改文件只需 1-3 秒增量编译。

## 各编译命令速查

| 命令 | 作用 | 产物 | 耗时 | 适用场景 |
|------|------|------|------|----------|
| `npm run compile` | gulp compile（仅 extensions） | extensions 下的 `out/` | ~3.5 min | 改了 extensions 时 |
| `gulp compile-client` | TypeScript 全量编译 src→out | `out/vs/**/*.js` | **5-7 min** | 改了 src/ 主代码、需要跑测试 |
| `npx tsc -p src/tsconfig.json --noEmit` | **仅类型检查不输出** | 无 | ~30-60s | 快速验证 0 errors（不能跑测试） |
| `npx tsc -p src/tsconfig.json` | 全量编译 src→out | 同 compile-client | 5-7 min | 不通过 gulp 的备选方案 |
| `npm run watch-client` | 增量监听编译 | `out/vs/**/*.js` | 首次 1-2 min，后续 1-3s | 频繁修改时常驻 |
| `npm run buildreact` | React UI bundle | React 产物 | ~30s | 改了 `browser/react/` |

⚠️ **常见误区**：`npm run compile` ≠ `gulp compile-client`。前者只编译 extensions，**不会**生成 `out/vs/workbench/contrib/void/**/*.js`，导致 mocha 找不到测试。

## 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| 编译超时（>10min） | 文件系统 I/O 瓶颈 | 关闭 Void.exe 和杀毒软件实时扫描 |
| `BuiltinToolResultType` 未使用 | 删除了 satisfies 但没清理 import | 移除未使用的 import |
| 打包失败 "EPERM" | Void.exe 锁定文件 | 先 Stop-Process |
| `npm run test-node` 无任何输出直接退出 | `out/` 下没有 `.test.js` | 先跑 `gulp compile-client` 或保持 `watch-client` 在跑 |
| `tsc` 跑 5+ 分钟"卡住" | 这是正常耗时（不是卡死） | 用 `--noEmit` 仅类型检查，或长开 watch-client |

---

## 更新日志

| 日期 | 内容 | 关联变更 |
|------|------|----------|
| 2026-05-26 | 初始创建：三阶段构建流程 | enhance-agent-prompt-and-context |
| 2026-05-28 | 补充「运行单元测试」章节、各编译命令对比表、watch-client 增量建议 | enhance-agent-prompt-and-context |
