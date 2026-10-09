/**
 * dsh-zh-thinking 的行为测试。
 *
 * 不依赖任何测试框架之外的包，用 Node 内置的 node:test 运行：
 *   node --test test/
 *
 * 这里 mock 一个最小的 Cordis 插件上下文，只保留 apply() 实际用到的
 * `ctx.effect` 与 `ctx.systemPrompt.section`，用来验证注册出去的
 * section 参数是否正确、以及配置容错是否按预期回落。
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { name, inject, apply } from "../lib/index.js";

/** 构造一个记录调用的假插件上下文。 */
function mockCtx() {
	const calls = [];
	const ctx = {
		calls,
		effect(fn, label) {
			calls.push({ kind: "effect", label });
			return fn();
		},
		systemPrompt: {
			section(section) {
				calls.push({ kind: "section", section });
				return () => {};
			},
		},
	};
	return ctx;
}

/** 取出本次 apply 注册的 section。 */
function registeredSection(ctx) {
	const hit = ctx.calls.find((c) => c.kind === "section");
	assert.ok(hit, "apply() 应当注册一个 section");
	return hit.section;
}

test("导出契约：插件名与 inject 声明", () => {
	assert.equal(name, "zh-thinking");
	assert.deepEqual(inject, ["systemPrompt"]);
});

test("默认注册：新名字 section、order 为 1、正文为内置文本", () => {
	const ctx = mockCtx();
	apply(ctx);

	assert.equal(ctx.calls.filter((c) => c.kind === "effect").length, 1);
	const section = registeredSection(ctx);
	assert.equal(section.name, "zh:reasoning-language");
	assert.equal(section.order, 1);
	assert.match(section.text, /语言要求/);
	assert.match(section.text, /简体中文/);
});

test("section 名必须是新名字，不能撞 preset 内的 persona section", () => {
	const ctx = mockCtx();
	apply(ctx);
	const section = registeredSection(ctx);
	// preset 里的 persona 行注册的就是这两个名字，撞上就会被它覆盖。
	assert.notEqual(section.name, "deployment:persona-prefix");
	assert.notEqual(section.name, "deployment:persona-suffix");
});

test("内置正文不能包含 {{ ，否则会被 dsh-system-prompt 当成变量引用", () => {
	const ctx = mockCtx();
	apply(ctx);
	assert.ok(!registeredSection(ctx).text.includes("{{"));
});

test("配置覆盖：sectionName / order / text 都能生效", () => {
	const ctx = mockCtx();
	apply(ctx, { sectionName: "my:lang", order: 42, text: "自定义正文" });
	const section = registeredSection(ctx);
	assert.equal(section.name, "my:lang");
	assert.equal(section.order, 42);
	assert.equal(section.text, "自定义正文");
});

test("配置容错：非法取值回落到默认值，而不是让加载失败", () => {
	const cases = [
		[undefined, "zh:reasoning-language", 1],
		[null, "zh:reasoning-language", 1],
		[42, "zh:reasoning-language", 1],
		[{}, "zh:reasoning-language", 1],
		[{ sectionName: "   ", order: Number.NaN }, "zh:reasoning-language", 1],
		[{ sectionName: "ok:name", order: "3" }, "ok:name", 1],
		[{ order: Number.POSITIVE_INFINITY }, "zh:reasoning-language", 1],
		[{ order: 0 }, "zh:reasoning-language", 0],
	];
	for (const [config, expectedName, expectedOrder] of cases) {
		const ctx = mockCtx();
		apply(ctx, config);
		const section = registeredSection(ctx);
		assert.equal(section.name, expectedName, `config=${JSON.stringify(config)}`);
		assert.equal(section.order, expectedOrder, `config=${JSON.stringify(config)}`);
	}
});

test("配置含 {{ 时回落内置文本并打印警告", (t) => {
	const warnings = [];
	t.mock.method(console, "warn", (...args) => warnings.push(args.join(" ")));

	const ctx = mockCtx();
	apply(ctx, { text: "这是 {{model}} 的用法" });

	assert.equal(warnings.length, 1);
	assert.match(warnings[0], /zh-thinking/);
	assert.ok(!registeredSection(ctx).text.includes("{{"));
});
