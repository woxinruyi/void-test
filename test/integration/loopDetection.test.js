/**
 * Headless Loop Detection Test
 *
 * 直接测试循环检测逻辑，无需 Electron GUI
 * 运行: node test/integration/loopDetection.test.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// ============ 从 chatThreadService.ts 提取的循环检测逻辑 ============

class LoopDetector {
	constructor() {
		this.recentToolCalls = new Map();
		this.LOOP_DETECTION_WINDOW = 5;
		this.LOOP_THRESHOLD = 3;
	}

	checkForLoop(threadId, toolName, params) {
		const paramsHash = JSON.stringify(params).substring(0, 200);
		const recent = this.recentToolCalls.get(threadId) || [];

		// 添加当前调用
		recent.push({ name: toolName, paramsHash, timestamp: Date.now() });

		// 只保留最近 LOOP_DETECTION_WINDOW 条
		while (recent.length > this.LOOP_DETECTION_WINDOW) {
			recent.shift();
		}
		this.recentToolCalls.set(threadId, recent);

		// 检查是否有重复
		const signature = `${toolName}:${paramsHash}`;
		const duplicates = recent.filter(r => `${r.name}:${r.paramsHash}` === signature);

		return duplicates.length >= this.LOOP_THRESHOLD;
	}

	clear(threadId) {
		this.recentToolCalls.delete(threadId);
	}

	getRecent(threadId) {
		return this.recentToolCalls.get(threadId) || [];
	}
}

// ============ 测试用例 ============

function runTests() {
	const results = [];
	const detector = new LoopDetector();
	const threadId = 'test-thread-1';

	// Test 1: Different params should NOT trigger loop
	{
		const start = Date.now();
		detector.clear(threadId);

		const result1 = detector.checkForLoop(threadId, 'read_file', { path: 'file1.txt' });
		const result2 = detector.checkForLoop(threadId, 'read_file', { path: 'file2.txt' });

		const passed = !result1 && !result2;
		results.push({
			name: 'Test 1: Different params no loop',
			passed,
			details: passed ? 'PASS: Different file paths did not trigger loop' : `FAIL: Unexpected trigger: result1=${result1}, result2=${result2}`,
			duration: Date.now() - start
		});
	}

	// Test 2: 3 consecutive identical calls SHOULD trigger
	{
		const start = Date.now();
		detector.clear(threadId);

		const params = { path: 'package.json' };
		const r1 = detector.checkForLoop(threadId, 'read_file', params);
		const r2 = detector.checkForLoop(threadId, 'read_file', params);
		const r3 = detector.checkForLoop(threadId, 'read_file', params);

		const passed = !r1 && !r2 && r3;
		results.push({
			name: 'Test 2: 3 identical calls trigger loop',
			passed,
			details: passed ? 'PASS: 3rd identical call correctly triggered loop' : `FAIL: r1=${r1}, r2=${r2}, r3=${r3}`,
			duration: Date.now() - start
		});
	}

	// Test 3: Insert different tool still counts in window
	{
		const start = Date.now();
		detector.clear(threadId);

		const params = { path: 'package.json' };
		detector.checkForLoop(threadId, 'read_file', params);
		detector.checkForLoop(threadId, 'read_file', params);
		detector.checkForLoop(threadId, 'list_dir', { path: '.' });
		const r4 = detector.checkForLoop(threadId, 'read_file', params);

		results.push({
			name: 'Test 3: Insert different tool still accumulates',
			passed: r4,
			details: r4 ? 'PASS: Window still has 3 identical calls' : `FAIL: r4=${r4}`,
			duration: Date.now() - start
		});
	}

	// Test 4: Window size limit (FIFO)
	{
		const start = Date.now();
		detector.clear(threadId);

		const params = { path: 'package.json' };
		detector.checkForLoop(threadId, 'read_file', params);
		detector.checkForLoop(threadId, 'read_file', params);
		detector.checkForLoop(threadId, 'edit_file', { path: 'a.txt' });
		detector.checkForLoop(threadId, 'edit_file', { path: 'b.txt' });
		detector.checkForLoop(threadId, 'edit_file', { path: 'c.txt' });
		const r = detector.checkForLoop(threadId, 'read_file', params);

		const passed = !r;
		results.push({
			name: 'Test 4: Window size limit (FIFO)',
			passed,
			details: passed ? 'PASS: Old calls pushed out of window' : `FAIL: r=${r}`,
			duration: Date.now() - start
		});
	}

	// Test 5: Multi-thread isolation
	{
		const start = Date.now();
		detector.clear('thread-A');
		detector.clear('thread-B');

		const params = { path: 'package.json' };
		detector.checkForLoop('thread-A', 'read_file', params);
		detector.checkForLoop('thread-A', 'read_file', params);
		detector.checkForLoop('thread-B', 'read_file', params);
		const rA = detector.checkForLoop('thread-A', 'read_file', params);
		const rB = detector.checkForLoop('thread-B', 'read_file', params);

		const passed = rA && !rB;
		results.push({
			name: 'Test 5: Multi-thread isolation',
			passed,
			details: passed ? 'PASS: Different threads correctly isolated' : `FAIL: rA=${rA}, rB=${rB}`,
			duration: Date.now() - start
		});
	}

	const passed = results.filter(r => r.passed).length;
	const failed = results.filter(r => !r.passed).length;

	return {
		testSuite: 'loopDetection',
		timestamp: new Date().toISOString(),
		totalTests: results.length,
		passed,
		failed,
		results
	};
}

// ============ 执行测试并输出结果 ============

function main() {
	console.log('========================================');
	console.log('  Void Headless Test: Loop Detection');
	console.log('========================================\n');

	const suiteResult = runTests();

	// 打印结果到控制台
	for (const test of suiteResult.results) {
		console.log(`${test.passed ? '✅' : '❌'} ${test.name} (${test.duration}ms)`);
		console.log(`   ${test.details}\n`);
	}

	console.log('----------------------------------------');
	console.log(`Total: ${suiteResult.totalTests} | Passed: ${suiteResult.passed} | Failed: ${suiteResult.failed}`);
	console.log('----------------------------------------\n');

	// 写入结果文件供 Cascade 读取
	const resultPath = path.join(os.tmpdir(), 'void_test_result.json');
	fs.writeFileSync(resultPath, JSON.stringify(suiteResult, null, 2));
	console.log(`Result written to: ${resultPath}`);

	// 返回退出码
	process.exit(suiteResult.failed > 0 ? 1 : 0);
}

main();
