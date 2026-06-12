# Phase 4 特性测试方案

> **创建时间**: 2026-04-20
> **测试范围**: Phase 4 (P2 - 体验增强) 全部 8 项特性
> **测试类型**: 单元测试（纯函数/算法验证）

---

## 一、测试目标

| # | 测试领域 | 覆盖特性 | 测试方法 |
|---|----------|----------|----------|
| 1 | **代码语义索引** | Phase 4.1 | 嵌入算法、向量搜索、代码分块、余弦相似度 |
| 2 | **文件创建与编辑** | 内置工具 | 工具参数验证、模糊编辑匹配(LCS)、审批逻辑 |
| 3 | **RAG 检索增强** | Phase 4.2/4.5 | Memory CRUD、规划服务类型、工具定义完整性 |

---

## 二、测试文件清单

```
src/vs/workbench/contrib/void/test/common/
├── autoApprove.test.ts          ← 已有（Phase 2 工具审批）
├── reasoningAuto.test.ts        ← 已有（推理等级自动选择）
├── codeIndex.test.ts            ← 新增：代码索引核心算法
├── toolValidation.test.ts       ← 新增：工具参数验证 + 模糊匹配
└── memoryAndRag.test.ts         ← 新增：Memory/Planning/RAG
```

---

## 三、测试用例详细设计

### 3.1 代码索引测试 (`codeIndex.test.ts`)

| 用例 ID | 用例名称 | 验证点 |
|---------|----------|--------|
| CI-01 | FNV-1a 哈希确定性 | 相同输入产生相同输出 |
| CI-02 | FNV-1a 哈希分散性 | 不同输入产生不同输出 |
| CI-03 | 特征嵌入维度正确 | 输出为 384 维 Float32Array |
| CI-04 | 嵌入向量已 L2 归一化 | 向量范数 ≈ 1.0 |
| CI-05 | 相似文本嵌入相近 | 余弦相似度 > 0.5 |
| CI-06 | 不相关文本嵌入较远 | 余弦相似度 < 相似文本 |
| CI-07 | 余弦相似度计算正确 | 单位测试已知向量对 |
| CI-08 | 朴素分块基本功能 | 文本被正确切分为块 |
| CI-09 | 朴素分块行号正确 | startLine/endLine 正确 |
| CI-10 | 语言检测覆盖常见扩展 | .ts/.py/.rs/.go 正确映射 |
| CI-11 | 向量存储插入+搜索 | 插入后能搜索到最相似项 |
| CI-12 | 向量存储过滤 | language/folder 过滤生效 |
| CI-13 | 向量存储删除 | deleteByFilePath 正确移除 |

### 3.2 工具验证与编辑测试 (`toolValidation.test.ts`)

| 用例 ID | 用例名称 | 验证点 |
|---------|----------|--------|
| TV-01 | builtinToolNames 包含所有工具 | 28 个工具名全部在列 |
| TV-02 | approvalType 分类正确 | 只读工具无 approvalType |
| TV-03 | perToolRules allow 规则 | 工具被放行时返回 auto |
| TV-04 | perToolRules deny 规则 | 工具被拒绝时返回 manual |
| TV-05 | mustAlwaysApprovePatterns | 危险命令强制审批 |
| TV-06 | LCS 行相似度算法 | 已知字符串对正确评分 |
| TV-07 | LCS 完全匹配 = 1.0 | 相同行 similarity = 1.0 |
| TV-08 | LCS 完全不同 = 0.0 | 无交集行 similarity = 0.0 |
| TV-09 | 模糊查找行（滑动窗口） | 在目标文本中找到近似匹配 |
| TV-10 | 工具定义参数完整 | semantic_search/remote_repo_* 参数齐全 |

### 3.3 Memory 与 RAG 测试 (`memoryAndRag.test.ts`)

| 用例 ID | 用例名称 | 验证点 |
|---------|----------|--------|
| MR-01 | MemoryItem 类型结构 | id/content/tags/createdAt 字段 |
| MR-02 | Memory 创建 | 新建 memory 返回正确结构 |
| MR-03 | Memory 查询 | getMemory(id) 返回正确项 |
| MR-04 | Memory 更新（同 id） | existingId 更新内容 |
| MR-05 | Memory 删除 | deleteMemory 后查不到 |
| MR-06 | Memory 批量操作 | 多次 save → getAllMemories 正确 |
| MR-07 | 路径段分解（层级 rules） | _getPathSegmentsToFile 逻辑 |
| MR-08 | Plan TodoItem 类型 | id/content/status/priority 字段 |
| MR-09 | 系统提示包含 memories | chat_systemMessage 生成含 `<memories>` |
| MR-10 | 系统提示包含 plan | chat_systemMessage 生成含 `<current_plan>` |
| MR-11 | 系统提示包含 ide_activity | chat_systemMessage 生成含 `<ide_activity>` |

---

## 四、执行方式

```bash
# 运行全部 Void 单元测试（mocha, node 环境）
npm run test-node -- --grep "Void"
```

---

## 五、通过标准

- 所有用例 PASS
- 无 disposable 泄露（`ensureNoDisposablesAreLeakedInTestSuite`）
- 无超时（默认 5000ms）
