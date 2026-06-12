# 设计说明（build-latest-win32-exe）

## 一、已知事实

1. 构建链路入口：`npm run compile-build`（已改为 `compile-build-without-mangling`）→ `npm run minify-vscode` → `node ./node_modules/gulp/bin/gulp.js vscode-win32-x64-user-setup`。
2. `compile-build` 与 `minify-vscode` 均已成功，`out-build/` 已刷新。
3. `vscode-win32-x64-user-setup` 报 `Error: spawn UNKNOWN`，抛出点位于 `build/gulpfile.vscode.win32.js` 的 `packageInnoSetup` 函数：

   ```javascript
   cp.spawn(innoSetupPath, args, { stdio: ['ignore', 'inherit', 'inherit'] })
   ```

4. `ISCC.exe` 存在于 `I:\自动化执行\void-main\node_modules\innosetup\bin\ISCC.exe`。
5. 独立用 `cp.spawnSync(ISCC.exe, ['/?'], { stdio: ['ignore','pipe','pipe'] })` 可成功执行（status=1 时返回 help，属正常）。

## 二、`spawn UNKNOWN` 可能根因

按可能性从高到低列出：

| # | 根因 | 依据 |
|---|---|---|
| 1 | `stdio: 'inherit'` 在非 TTY 宿主（PowerShell 内调用 Node）对子进程继承的句柄做 DuplicateHandle 失败 | 手动用 `pipe` 能成功，用 `inherit` 未验证 |
| 2 | `/sesrp=node <path> $f` 参数中带有空格的命令字符串在 Windows `CreateProcess` 下被误解析 | `<path>` 为绝对路径，Node spawn 非 shell 模式对含空格参数敏感 |
| 3 | 中文路径 `I:\自动化执行\void-main\...` 在某个链路被误转 ANSI，CreateProcessW 收到非法字符 | 仓库路径含中文，属 Windows 下此类错误经典触发条件 |
| 4 | `innoSetupPath` 指向的 ISCC.exe 启动时依赖 CWD 里的附加 DLL（如 `ISCmplr.dll`），spawn 未显式设置 `cwd` | gulpfile 没传 `cwd`，默认继承仓库根，但 ISCC 所需 DLL 与 EXE 同目录 |
| 5 | 父进程（gulp）某个插件把 `process.env` 中 `ComSpec`/`SystemRoot` 清空 | 属边界嫌疑，概率较低 |

## 三、定位策略：三次独立 Node 探测

编写一份一次性诊断脚本 `build/lib/debug-inno-spawn.js`（不纳入 commit，跑完删除）：

```javascript
const cp = require('child_process');
const path = require('path');
const iscc = path.resolve('node_modules/innosetup/bin/ISCC.exe');
const iss = path.resolve('build/win32/code.iss');

function run(label, opts, args) {
  console.log('\n=== ' + label + ' ===');
  try {
    const r = cp.spawnSync(iscc, args, opts);
    console.log('status:', r.status, 'error:', r.error && r.error.code, r.error && r.error.message);
  } catch (e) {
    console.log('threw:', e.code, e.message);
  }
}

// 探测 1：与 gulpfile 完全一致
run('A inherit + full args', { stdio: ['ignore','inherit','inherit'] }, [iss, '/dFoo=bar']);

// 探测 2：把 stdio 换 pipe
run('B pipe + full args', { stdio: ['ignore','pipe','pipe'] }, [iss, '/dFoo=bar']);

// 探测 3：shell:true 规避 Windows CreateProcess 路径解析差异
run('C shell + inherit', { stdio: ['ignore','inherit','inherit'], shell: true }, [iss, '/dFoo=bar']);

// 探测 4：把 ISCC 的 cwd 设为其所在目录
run('D cwd=iscc dir', { stdio: ['ignore','inherit','inherit'], cwd: path.dirname(iscc) }, [iss, '/dFoo=bar']);
```

通过 A~D 四组矩阵结果，即可锁定根因：

- 只有 A 失败、B 成功 → **根因 1（stdio inherit 问题）**
- A/B 都失败、C 成功 → **根因 2（Windows CreateProcess 参数解析）**
- 所有都失败且错误含 `spawn UNKNOWN` → 继续探测中文路径/短路径（根因 3）
- 只有 D 成功 → **根因 4（cwd 需指向 ISCC 目录）**

## 四、对应修复

### 修复候选 1（stdio 问题）

```javascript
cp.spawn(innoSetupPath, args, { stdio: ['ignore', 'pipe', 'pipe'] })
  .on('error', cb)
  .on('exit', code => { ... });
// 同时把 child.stdout/stderr 管道透传到 process.stdout/stderr
```

### 修复候选 2（Windows 参数解析）

```javascript
cp.spawn(innoSetupPath, args, { stdio: ['ignore', 'inherit', 'inherit'], shell: true, windowsVerbatimArguments: true })
```

或单独给 `/sesrp=...` 追加外层双引号保护。

### 修复候选 3（中文路径）

调用 `GetShortPathNameW` 拿到 short name，再 spawn：

```javascript
const shortPath = require('./util').toShortPath(innoSetupPath); // 新增工具
cp.spawn(shortPath, args, { ... })
```

或临时 junction 仓库到 ASCII 路径（`mklink /J C:\void-build I:\自动化执行\void-main`）后在 junction 下构建。

### 修复候选 4（cwd 缺失）

```javascript
cp.spawn(innoSetupPath, args, { stdio: [...], cwd: path.dirname(innoSetupPath) })
```

## 五、回退路径

如果在合理时间内无法让 `vscode-win32-x64-user-setup` 稳定通过：

- 改用 `node ./node_modules/gulp/bin/gulp.js vscode-win32-x64-min`，产出 `I:\自动化执行\VSCode-win32-x64\`。
- 该目录即免安装 portable 版本，`Void.exe` 可直接运行。
- 用 7z/zip 打包为单文件交付物。

免安装产物同样满足“最新代码 → 可运行 EXE”的目标，区别仅在于缺少 Inno Setup 的安装引导与注册表写入，对中文化验收不构成阻碍。

## 六、时间盒

- 根因定位（阶段二）：30 分钟。
- 修复与重跑（阶段三、四）：20 分钟。
- 超出 60 分钟仍失败时，立即转入回退预案（阶段五）。
