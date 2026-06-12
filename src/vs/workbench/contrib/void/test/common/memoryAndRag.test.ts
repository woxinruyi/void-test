/*--------------------------------------------------------------------------------------
 *  Memory / Planning / RAG 单元测试
 *  覆盖：MemoryItem 类型、Memory CRUD 模拟、路径段分解、Plan 类型、工具定义完整性
 *--------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import type { MemoryItem, SaveMemoryResult, DeleteMemoryResult } from '../../common/memoryServiceTypes.js';
import type { TodoItem, Plan, PlanningToolResult } from '../../common/planningServiceTypes.js';


// ---- Replicated pure logic from memoryService.ts ----

function getPathSegmentsToFile(rootPath: string, filePath?: string): string[] {
	const segments: string[] = [rootPath];
	if (!filePath) return segments;

	const normalizedRoot = rootPath.replace(/\\/g, '/');
	const normalizedFile = filePath.replace(/\\/g, '/');

	if (!normalizedFile.startsWith(normalizedRoot)) return segments;

	const relativePath = normalizedFile.substring(normalizedRoot.length + 1);
	const parts = relativePath.split('/');

	let current = rootPath;
	for (let i = 0; i < parts.length - 1; i++) {
		current = current + '/' + parts[i];
		segments.push(current);
	}

	return segments;
}


// Simple in-memory MemoryService mock for testing CRUD logic
class MockMemoryService {
	private _memories: MemoryItem[] = [];
	private _nextId = 1;

	saveMemory(content: string, tags: string[] = [], existingId?: string): MemoryItem {
		const now = Date.now();

		if (existingId) {
			const existing = this._memories.find(m => m.id === existingId);
			if (existing) {
				existing.content = content;
				existing.tags = tags;
				return existing;
			}
		}

		const memory: MemoryItem = {
			id: `mem-${this._nextId++}`,
			content,
			tags,
			createdAt: now,
		};
		this._memories.push(memory);
		return memory;
	}

	deleteMemory(id: string): boolean {
		const idx = this._memories.findIndex(m => m.id === id);
		if (idx === -1) return false;
		this._memories.splice(idx, 1);
		return true;
	}

	getMemory(id: string): MemoryItem | null {
		return this._memories.find(m => m.id === id) ?? null;
	}

	getAllMemories(): readonly MemoryItem[] {
		return this._memories;
	}

	get size(): number { return this._memories.length; }
}


// ---- Tests ----

suite('Void - Memory & RAG', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('MR-01: MemoryItem 类型结构', () => {
		test('包含必要字段', () => {
			const item: MemoryItem = {
				id: 'test-1',
				content: 'Test memory content',
				tags: ['test', 'unit'],
				createdAt: Date.now(),
			};
			assert.strictEqual(typeof item.id, 'string');
			assert.strictEqual(typeof item.content, 'string');
			assert.ok(Array.isArray(item.tags));
			assert.strictEqual(typeof item.createdAt, 'number');
		});
	});

	suite('MR-02/03/04/05/06: Memory CRUD', () => {
		let service: MockMemoryService;

		setup(() => {
			service = new MockMemoryService();
		});

		test('MR-02: 创建 memory 返回正确结构', () => {
			const mem = service.saveMemory('项目使用 MIT 许可证', ['license']);
			assert.ok(mem.id);
			assert.strictEqual(mem.content, '项目使用 MIT 许可证');
			assert.deepStrictEqual(mem.tags, ['license']);
			assert.ok(mem.createdAt > 0);
		});

		test('MR-03: getMemory(id) 返回正确项', () => {
			const mem = service.saveMemory('Test content');
			const found = service.getMemory(mem.id);
			assert.ok(found !== null);
			assert.strictEqual(found!.id, mem.id);
			assert.strictEqual(found!.content, 'Test content');
		});

		test('MR-03b: getMemory 不存在的 id → null', () => {
			const found = service.getMemory('nonexistent');
			assert.strictEqual(found, null);
		});

		test('MR-04: existingId 更新内容', () => {
			const mem = service.saveMemory('Original', ['v1']);
			assert.strictEqual(service.size, 1);

			const updated = service.saveMemory('Updated', ['v2'], mem.id);
			assert.strictEqual(service.size, 1, '更新不应增加条目');
			assert.strictEqual(updated.content, 'Updated');
			assert.deepStrictEqual(updated.tags, ['v2']);
			assert.strictEqual(updated.id, mem.id);
		});

		test('MR-05: deleteMemory 后查不到', () => {
			const mem = service.saveMemory('To delete');
			assert.strictEqual(service.size, 1);

			const deleted = service.deleteMemory(mem.id);
			assert.strictEqual(deleted, true);
			assert.strictEqual(service.size, 0);
			assert.strictEqual(service.getMemory(mem.id), null);
		});

		test('MR-05b: 删除不存在的 id → false', () => {
			assert.strictEqual(service.deleteMemory('nonexistent'), false);
		});

		test('MR-06: 批量操作', () => {
			service.saveMemory('Memory 1', ['a']);
			service.saveMemory('Memory 2', ['b']);
			service.saveMemory('Memory 3', ['c']);

			const all = service.getAllMemories();
			assert.strictEqual(all.length, 3);
			assert.strictEqual(all[0].content, 'Memory 1');
			assert.strictEqual(all[2].content, 'Memory 3');
		});
	});

	suite('MR-07: 路径段分解（层级 rules）', () => {
		test('无 filePath → 只返回根', () => {
			const segments = getPathSegmentsToFile('C:/project');
			assert.deepStrictEqual(segments, ['C:/project']);
		});

		test('文件在根目录 → 只返回根', () => {
			const segments = getPathSegmentsToFile('C:/project', 'C:/project/file.ts');
			assert.deepStrictEqual(segments, ['C:/project']);
		});

		test('文件在子目录 → 返回根 + 中间目录', () => {
			const segments = getPathSegmentsToFile('C:/project', 'C:/project/src/utils/file.ts');
			assert.deepStrictEqual(segments, [
				'C:/project',
				'C:/project/src',
				'C:/project/src/utils',
			]);
		});

		test('Windows 反斜杠归一化', () => {
			const segments = getPathSegmentsToFile('C:\\project', 'C:\\project\\src\\file.ts');
			assert.deepStrictEqual(segments, [
				'C:\\project',
				'C:\\project/src',
			]);
		});

		test('文件不在工作区 → 只返回根', () => {
			const segments = getPathSegmentsToFile('C:/project-a', 'C:/project-b/src/file.ts');
			assert.deepStrictEqual(segments, ['C:/project-a']);
		});
	});

	suite('MR-08: Plan TodoItem 类型', () => {
		test('TodoItem 包含必要字段', () => {
			const item: TodoItem = {
				id: 'todo-1',
				content: 'Implement feature X',
				status: 'pending',
				priority: 'high',
				createdAt: Date.now(),
				updatedAt: Date.now(),
			};
			assert.strictEqual(typeof item.id, 'string');
			assert.strictEqual(typeof item.content, 'string');
			assert.ok(['pending', 'in_progress', 'completed'].includes(item.status));
			assert.ok(['high', 'medium', 'low'].includes(item.priority));
		});

		test('Plan 包含必要字段', () => {
			const plan: Plan = {
				id: 'plan-1',
				title: 'Test Plan',
				description: 'A test plan',
				todos: [],
				createdAt: Date.now(),
				updatedAt: Date.now(),
			};
			assert.strictEqual(typeof plan.id, 'string');
			assert.strictEqual(typeof plan.title, 'string');
			assert.ok(Array.isArray(plan.todos));
		});

		test('PlanningToolResult 结构', () => {
			const result: PlanningToolResult = {
				plan: {
					id: 'plan-1',
					title: 'Test',
					description: '',
					todos: [{
						id: 'todo-1',
						content: 'Task 1',
						status: 'completed',
						priority: 'high',
						createdAt: Date.now(),
						updatedAt: Date.now(),
					}],
					createdAt: Date.now(),
					updatedAt: Date.now(),
				},
				action: 'updated',
				summary: '1/1 tasks completed',
			};
			assert.ok(result.plan);
			assert.strictEqual(result.action, 'updated');
			assert.ok(result.summary.length > 0, 'summary 不应为空');
		});
	});

	suite('MR-09/10/11: SaveMemoryResult / DeleteMemoryResult 类型', () => {
		test('SaveMemoryResult 结构', () => {
			const result: SaveMemoryResult = {
				memory: { id: 'x', content: 'test', tags: [], createdAt: Date.now() },
				action: 'created',
				totalMemories: 1,
			};
			assert.ok(['created', 'updated'].includes(result.action));
			assert.ok(result.memory);
		});

		test('DeleteMemoryResult 结构', () => {
			const result: DeleteMemoryResult = {
				deleted: true,
				id: 'x',
				totalMemories: 0,
			};
			assert.strictEqual(typeof result.deleted, 'boolean');
			assert.strictEqual(typeof result.id, 'string');
		});
	});
});
