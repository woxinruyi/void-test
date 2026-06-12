# 任务清单（verify-zh-localization）

## 1. 枚举产物

- [ ] 1.1 列出 `I:\自动化执行\VSCode-win32-x64\` 顶层，确认 `Void.exe`、`resources\app\product.json`、`resources\app\out\nls.messages.json` 存在。
- [ ] 1.2 列出 `resources\app\extensions\` 下所有语言包相关目录。

## 2. 静态核对 product.json

- [ ] 2.1 解析 `../VSCode-win32-x64/resources/app/product.json` 并打印 `defaultLocale`、`locale`、`nameShort`、`nameLong`、`builtInExtensions` 中与 `zh-hans` 相关的条目。
- [ ] 2.2 解析 `.build/win32-x64/user-setup/product.json`（Inno Setup 打包期写入），做对比核对。
- [ ] 2.3 结论：`defaultLocale` 是否等于 `zh-cn`；若不是，记录实际值与差异。

## 3. 静态核对 NLS 产物

- [ ] 3.1 确认 `../VSCode-win32-x64/resources/app/out/nls.messages.json`（或 `nls.messages.zh-cn.json`）存在且大小 > 0。
- [ ] 3.2 在 nls.messages 中搜索典型菜单关键字（“文件”“编辑”“视图”“终端”“帮助”“命令面板”），命中数 ≥ 4 判定中文翻译生效。
- [ ] 3.3 确认 `vscode-language-pack-zh-hans`（或等价语言包）在 `resources\app\extensions\` 下存在且 `package.json` 中 `contributes.localizations` 含 `zh-cn`。

## 4. 动态启动验收

- [ ] 4.1 创建临时 `user-data-dir`：`%TEMP%\void-zh-verify-<yyyymmdd-HHMMSS>`。
- [ ] 4.2 启动 `Void.exe --user-data-dir=<临时目录> --new-window`，后台运行 ≤ 10 秒。
- [ ] 4.3 读取该临时目录下 `logs/` 最新 `main.log` / `renderer*.log`，搜索：
  - `osLocale`、`setLocaleForUser`、`zh-cn`、`zh-hans`、`language-pack`
  - 若命中且为 `zh-cn`，判定 NLS 选择通过。
- [ ] 4.4 终止 `Void.exe` 进程（`taskkill /IM Void.exe /F`）。

## 5. 归档结论

- [ ] 5.1 生成 `文档/temp-中文化最终验收记录.md`，包含每项子结论、证据（路径、关键字命中行号）。
- [ ] 5.2 更新本 change 的 proposal.md 末尾“验收结论”。
- [ ] 5.3 `openspec validate verify-zh-localization --strict` 通过。
