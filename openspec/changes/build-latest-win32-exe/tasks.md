# 任务清单（build-latest-win32-exe）

## 1. 前置核对

- [ ] 1.1 确认 `I:\自动化执行\VSCode-win32-x64\` 存在且包含 `Void.exe`、`resources/app/product.json`；若缺失，执行 `node ./node_modules/gulp/bin/gulp.js vscode-win32-x64-min` 先产出该目录。
- [ ] 1.2 确认 `node_modules/innosetup/bin/ISCC.exe`、`build/win32/code.iss`、`build/win32/inno_updater.exe`、`build/win32/vcruntime140.dll` 存在。
- [ ] 1.3 校验 `out-build/` 时间戳为最近一次 `compile-build-without-mangling` 产物，否则补跑编译。

## 2. 根因定位

- [ ] 2.1 直接重跑 `node ./node_modules/gulp/bin/gulp.js vscode-win32-x64-user-setup`，把完整错误栈与 `process.argv`、`cwd`、`env` 打印到 `文档/temp-inno-setup-spawn-unknown-诊断.log`。
- [ ] 2.2 用 Node 脚本等价调用 ISCC（stdio 与参数与 `packageInnoSetup` 完全一致），复现或排除 `spawn UNKNOWN`。
- [ ] 2.3 若 2.2 能复现，逐步缩减参数：先仅传 `code.iss`；再加 `/d*` 定义；再加 `/sesrp=...`，锁定触发形态。
- [ ] 2.4 对比 gulp 子进程环境与手动调用环境，关注 `ComSpec`、`PATHEXT`、`SystemRoot`、`windir` 是否被上游清空。
- [ ] 2.5 评估中文路径嫌疑：尝试把 `innoSetupPath` 转换为 Windows short path（`GetShortPathName`）再 spawn，看能否绕开。

## 3. 修复或规避

- [ ] 3.1 根据 2.x 结论，在 `build/gulpfile.vscode.win32.js` 的 `packageInnoSetup` 中应用最小补丁（候选：`shell: true`、stdio 改 `pipe`、ISCC 路径转 short path）。
- [ ] 3.2 本地验证补丁后 `vscode-win32-x64-user-setup` 可正常执行 Inno Setup。
- [ ] 3.3 若补丁涉及 gulpfile，标注“本地构建补丁”，避免误传 CI。

## 4. 产出与核对

- [ ] 4.1 构建成功后记录 `.build/win32-x64/user-setup/VSCodeSetup.exe`：路径、大小（MB）、SHA256、mtime。
- [ ] 4.2 将本轮构建日志与关键决策记录到 `文档/temp-最新EXE构建诊断与产出记录.md`。
- [ ] 4.3 在本 change 的 README.md 或 proposal.md 末尾追加“最终产物”小节，链接产物路径。

## 5. 回退预案

- [ ] 5.1 如多次尝试后 setup 仍失败，执行 `vscode-win32-x64-min` 产出 `VSCode-win32-x64/` 目录作为免安装交付物。
- [ ] 5.2 使用 7z/zip 压缩该目录为 `Void-win32-x64-<version>.zip` 作为最小可验收产物。

## 6. 归档

- [ ] 6.1 `openspec validate build-latest-win32-exe --strict` 通过。
- [ ] 6.2 构建成功并产出 EXE 后，后续独立 change 中进行干净用户目录中文化验收。
