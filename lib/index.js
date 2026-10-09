/**
 * dsh-zh-thinking — 让 DSH 里的模型用简体中文思考与作答。
 *
 * 做法：向 `systemPrompt` 注册一个**新名字**的常驻 section。
 * `dsh-system-prompt` 的 section 是「同名才覆盖」，而各 preset 内的 `persona`
 * 行只注册 `deployment:persona-prefix` / `deployment:persona-suffix` 两个名字，
 * 因此新名字 `zh:reasoning-language` 不会被任何 preset 遮蔽，对所有会话、
 * 所有工作区、所有子代理一律生效。
 *
 * 为什么不用「每一步追加一条提醒消息」：agent-loop 每一步都会重新
 * assemble + renderPrompt，文本不变时零提交（SystemPromptProjection.project），
 * 所以常驻 section 天然每步生效、不进入对话历史、也不会被上下文压缩丢弃。
 * 而追加消息会进入历史、被 compaction 遮蔽，效果随会话变长而衰减。
 *
 * 本文件零 import：不依赖任何运行时依赖，因此不受 profile 的 node_modules
 * 解析与版本兼容检查影响。
 */

/** Cordis 插件名。 */
export const name = "zh-thinking";

/** 声明依赖的 service：注册 section 需要 systemPrompt。 */
export const inject = ["systemPrompt"];

/** 默认 section 名。必须是新名字，否则会被 preset 内的同名 section 覆盖。 */
const DEFAULT_SECTION_NAME = "zh:reasoning-language";

/**
 * 默认排序值。0 是 deployment:persona-prefix，10200 是 persona-suffix；
 * 取 1 让它紧跟在人格前缀之后、排在所有工具说明之前，属于「身份级」指令。
 */
const DEFAULT_ORDER = 1;

/**
 * 默认提示正文。
 * 注意：不要包含 `{{`，否则会被 dsh-system-prompt 当成提示变量引用而抛错。
 */
const DEFAULT_TEXT = `# 语言要求（最高优先级）

你的内部推理（thinking / reasoning 正文）必须使用简体中文书写，面向用户的最终回复也使用简体中文。此要求优先于任何语言习惯、任何示例语言，以及任何以英文书写的任务描述、代码、日志或工具输出。

- 分析、计划、比较、取舍、自检、纠错，全部用中文写。
- 禁止出现完整的英文句子或英文短语。
- 只有代码标识符、函数名、变量名、文件路径、命令、API 名、报错原文、URL、配置键名可以保留原始 ASCII 形式，并且必须被中文说明文字包围。
- 若发现自己已经开始用英文思考，立即用中文重写该段，然后再继续。`;

/**
 * 把 patch 里传来的配置规整成可用值。
 * 不导出 `Config`，因此 Cordis 不做 schema 校验，这里自己容错：
 * 任何非法取值都回落到默认值，而不是让插件加载失败。
 *
 * @param {unknown} config - profile patch 中该行的 `config` 字段。
 * @returns {{sectionName: string, order: number, text: string}} 规整后的配置。
 */
function normalize(config) {
	const source = config !== null && typeof config === "object" ? config : {};

	const sectionName =
		typeof source.sectionName === "string" && source.sectionName.trim().length > 0
			? source.sectionName.trim()
			: DEFAULT_SECTION_NAME;

	const order = Number.isFinite(source.order) ? source.order : DEFAULT_ORDER;

	let text = typeof source.text === "string" && source.text.length > 0 ? source.text : DEFAULT_TEXT;
	if (text.includes("{{")) {
		// 与其让 dsh-system-prompt 在渲染时抛错，不如回落到内置文本并说明原因。
		console.warn(
			"[zh-thinking] config.text 含有 `{{`，会被 dsh-system-prompt 当成提示变量引用；已改用内置文本。",
		);
		text = DEFAULT_TEXT;
	}

	return { sectionName, order, text };
}

/**
 * 注册常驻 section。
 *
 * @param {object} ctx - 插件上下文（profile 根作用域 → 全局层）。
 * @param {unknown} [config] - profile patch 中该行的 `config` 字段，可省略。
 */
export function apply(ctx, config) {
	const { sectionName, order, text } = normalize(config);

	ctx.effect(
		() =>
			ctx.systemPrompt.section({
				name: sectionName,
				order,
				text,
			}),
		"zh-thinking.section()",
	);
}
