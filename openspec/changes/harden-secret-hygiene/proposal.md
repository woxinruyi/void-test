# 提案：硬化密钥/隐私提交防护（harden-secret-hygiene）

## 背景

在一次"提交累积二次开发工作到公开仓库"的操作中，人工审计发现工作树里的 `文档/账号信息.md` 含 **33+ 组真实 Gmail 邮箱+密码**（来源 test_credentials.txt），且已处于 git 暂存区——**若未审计将直接推送到公开 GitHub（`github.com/woxinruyi/aiyiwei.git`）**。此外还混入运行时日志、调试 scratch、下载网页、营销邮件脚本等不宜公开内容。

本次靠人工逐文件审计才拦下，**缺少自动化防线**：husky 已有 precommit 钩子，但不扫描密钥/凭证；`.gitignore` 也未覆盖这些隐私/scratch 类别。需把"人工审计"固化为"自动阻断"，避免下次泄露。

## 目标

1. 在 husky `precommit` 中增加**密钥/凭证扫描**：命中即**阻断提交**并提示命中文件与行。
2. 扫描覆盖常见高危模式：`sk-` 开头 API key、`AKIA`(AWS)、`ghp_/gho_`(GitHub PAT)、`-----BEGIN PRIVATE KEY-----`、`password/授权码/api_key = '真实值'`、`邮箱|密码` 凭证表、`Bearer <token>`。
3. 固化 `.gitignore` 的隐私/运行时/scratch 排除段（已在本次提交补入，纳入规范并补注释）。
4. 文档化：在 `architecture/` 或 README 记录"提交前隐私审计 checklist"。

## 非目标

- 不引入重型第三方密钥扫描服务（如 gitleaks 二进制下载）——首版用轻量内置脚本，保持零外部依赖、跨平台（Windows 主）。
- 不对历史提交做 rewrite（本次确认凭证从未进入任何 commit，无需清史）。
- 不扫描 node_modules / out / 上游 CI 文件（已知误报源，列入忽略）。

## 影响范围

- 进程/层：仓库工程化（git 钩子 + 构建脚本），不涉及运行时代码。
- 文件：`.husky/pre-commit` 或其调用的 `npm run precommit` 链；新增 `build/lib/scan-secrets.js`（或 `.mjs`）；`.gitignore`；架构文档。

## 验收标准

- 故意暂存一个含 `sk-xxxxx...` 或邮箱+密码表的文件并 `git commit` → **提交被阻断**，输出命中文件与行号。
- 正常源码提交不被误伤（上游 CI 的 `$(github-distro-mixin-password)` 等占位不算命中）。
- `.gitignore` 覆盖：凭证文档、日志、checkpoints、下载网页、营销脚本、调试 scratch、temp 分析文档。
- 文档含"提交前隐私审计 checklist"。
