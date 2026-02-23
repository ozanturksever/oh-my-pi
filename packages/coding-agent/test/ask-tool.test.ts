import { describe, expect, test, vi } from "bun:test";
import type { AgentToolContext } from "@oh-my-pi/pi-agent-core";
import type { AskToolDetails } from "@oh-my-pi/pi-coding-agent/tools/ask";
import { AskTool } from "@oh-my-pi/pi-coding-agent/tools/ask";

const OTHER_OPTION = "Other (type your own)";

function createAskTool() {
	const session = {
		hasUI: true,
		settings: {
			get(key: string) {
				if (key === "ask.notify") return "off";
				if (key === "ask.timeout") return 0; // disabled
				return undefined;
			},
		},
		getPlanModeState: () => undefined,
	};
	return new AskTool(session as any);
}

function createMultiSelectUI(opts: { multiSelectResult?: string[] | undefined; inputResult?: string | undefined }) {
	const multiSelectCalls: Array<{ title: string; options: string[] }> = [];
	const inputCalls: string[] = [];

	const ui = {
		select: vi.fn(async () => undefined),
		multiSelect: vi.fn(async (title: string, options: string[]) => {
			multiSelectCalls.push({ title, options });
			return opts.multiSelectResult;
		}),
		input: vi.fn(async (prompt: string) => {
			inputCalls.push(prompt);
			return opts.inputResult;
		}),
		confirm: vi.fn(async () => false),
		notify: vi.fn(),
		onTerminalInput: vi.fn(() => () => {}),
		setStatus: vi.fn(),
		setWorkingMessage: vi.fn(),
		setWidget: vi.fn(),
		setTitle: vi.fn(),
		custom: vi.fn(async () => undefined as never),
		setEditorText: vi.fn(),
		pasteToEditor: vi.fn(),
		getEditorText: vi.fn(() => ""),
		editor: vi.fn(async () => undefined),
		get theme(): any {
			return {};
		},
		getAllThemes: vi.fn(async () => []),
		getTheme: vi.fn(async () => undefined),
		setTheme: vi.fn(async () => ({ success: false, error: "test" })),
		setFooter: vi.fn(),
		setHeader: vi.fn(),
		setEditorComponent: vi.fn(),
		getToolsExpanded: vi.fn(() => false),
		setToolsExpanded: vi.fn(),
	};

	return { ui, multiSelectCalls, inputCalls };
}

function makeContext(ui: Record<string, unknown>): AgentToolContext {
	return { hasUI: true, ui } as unknown as AgentToolContext;
}

function singleMultiQuestion(options: string[]) {
	return {
		questions: [
			{
				id: "q1",
				question: "Pick items",
				options: options.map(label => ({ label })),
				multi: true,
			},
		],
	};
}

describe("ask tool multi-select", () => {
	test("single selection returns that option", async () => {
		const tool = createAskTool();
		const { ui } = createMultiSelectUI({ multiSelectResult: ["Alpha"] });

		const result = await tool.execute(
			"call-1",
			singleMultiQuestion(["Alpha", "Beta", "Gamma"]),
			undefined,
			undefined,
			makeContext(ui),
		);

		const details = result.details as AskToolDetails;
		expect(details.selectedOptions).toEqual(["Alpha"]);
		expect(details.customInput).toBeUndefined();
		expect(result.content[0]).toHaveProperty("text", "User selected: Alpha");
	});

	test("multiple selections returns all selected options", async () => {
		const tool = createAskTool();
		const { ui } = createMultiSelectUI({ multiSelectResult: ["Alpha", "Gamma"] });

		const result = await tool.execute(
			"call-2",
			singleMultiQuestion(["Alpha", "Beta", "Gamma"]),
			undefined,
			undefined,
			makeContext(ui),
		);

		const details = result.details as AskToolDetails;
		expect(details.selectedOptions).toEqual(["Alpha", "Gamma"]);
		expect(details.customInput).toBeUndefined();
	});

	test("cancel (undefined) returns empty selection", async () => {
		const tool = createAskTool();
		const { ui } = createMultiSelectUI({ multiSelectResult: undefined });

		const result = await tool.execute(
			"call-3",
			singleMultiQuestion(["Alpha", "Beta"]),
			undefined,
			undefined,
			makeContext(ui),
		);

		const details = result.details as AskToolDetails;
		expect(details.selectedOptions).toEqual([]);
		expect(details.customInput).toBeUndefined();
		expect(result.content[0]).toHaveProperty("text", "User cancelled the selection");
	});

	test("empty array returns empty selection", async () => {
		const tool = createAskTool();
		const { ui } = createMultiSelectUI({ multiSelectResult: [] });

		const result = await tool.execute(
			"call-4",
			singleMultiQuestion(["Alpha"]),
			undefined,
			undefined,
			makeContext(ui),
		);

		const details = result.details as AskToolDetails;
		expect(details.selectedOptions).toEqual([]);
	});

	test("Other option triggers input prompt", async () => {
		const tool = createAskTool();
		const { ui, inputCalls } = createMultiSelectUI({
			multiSelectResult: [OTHER_OPTION],
			inputResult: "custom answer",
		});

		const result = await tool.execute(
			"call-5",
			singleMultiQuestion(["Alpha", "Beta"]),
			undefined,
			undefined,
			makeContext(ui),
		);

		const details = result.details as AskToolDetails;
		expect(details.selectedOptions).toEqual([]);
		expect(details.customInput).toBe("custom answer");
		expect(inputCalls).toEqual(["Enter your response:"]);
		expect(result.content[0]).toHaveProperty("text", "User provided custom input: custom answer");
	});

	test("Other mixed with real selections", async () => {
		const tool = createAskTool();
		const { ui, inputCalls } = createMultiSelectUI({
			multiSelectResult: ["Beta", OTHER_OPTION],
			inputResult: "extra context",
		});

		const result = await tool.execute(
			"call-6",
			singleMultiQuestion(["Alpha", "Beta", "Gamma"]),
			undefined,
			undefined,
			makeContext(ui),
		);

		const details = result.details as AskToolDetails;
		expect(details.selectedOptions).toEqual(["Beta"]);
		expect(details.customInput).toBe("extra context");
		expect(inputCalls).toEqual(["Enter your response:"]);
	});

	test("Other selected but input cancelled returns selections without customInput", async () => {
		const tool = createAskTool();
		const { ui } = createMultiSelectUI({
			multiSelectResult: ["Alpha", OTHER_OPTION],
			inputResult: undefined,
		});

		const result = await tool.execute(
			"call-7",
			singleMultiQuestion(["Alpha", "Beta"]),
			undefined,
			undefined,
			makeContext(ui),
		);

		const details = result.details as AskToolDetails;
		expect(details.selectedOptions).toEqual(["Alpha"]);
		expect(details.customInput).toBeUndefined();
	});

	test("passes Other option in the options list to multiSelect", async () => {
		const tool = createAskTool();
		const { ui, multiSelectCalls } = createMultiSelectUI({ multiSelectResult: undefined });

		await tool.execute("call-8", singleMultiQuestion(["A", "B"]), undefined, undefined, makeContext(ui));

		expect(multiSelectCalls).toHaveLength(1);
		expect(multiSelectCalls[0].title).toBe("Pick items");
		expect(multiSelectCalls[0].options).toEqual(["A", "B", OTHER_OPTION]);
	});

	test("does not call input when Other is not selected", async () => {
		const tool = createAskTool();
		const { ui, inputCalls } = createMultiSelectUI({ multiSelectResult: ["Alpha"] });

		await tool.execute("call-9", singleMultiQuestion(["Alpha", "Beta"]), undefined, undefined, makeContext(ui));

		expect(inputCalls).toHaveLength(0);
	});

	test("response text for multi includes comma-separated list", async () => {
		const tool = createAskTool();
		const { ui } = createMultiSelectUI({ multiSelectResult: ["X", "Z"] });

		const result = await tool.execute(
			"call-10",
			singleMultiQuestion(["X", "Y", "Z"]),
			undefined,
			undefined,
			makeContext(ui),
		);

		const text = (result.content[0] as { text: string }).text;
		expect(text).toBe("User selected: X, Z");
	});

	test("does not call select (single-select) in multi mode", async () => {
		const tool = createAskTool();
		const { ui } = createMultiSelectUI({ multiSelectResult: ["A"] });

		await tool.execute("call-11", singleMultiQuestion(["A", "B"]), undefined, undefined, makeContext(ui));

		expect(ui.select).not.toHaveBeenCalled();
	});
});

const RECOMMENDED_SUFFIX = " (Recommended)";

function createSingleSelectUI(opts: { selectResult?: string | undefined; inputResult?: string | undefined }) {
	const selectCalls: Array<{ title: string; options: string[]; opts?: Record<string, unknown> }> = [];
	const inputCalls: string[] = [];

	const ui = {
		select: vi.fn(async (title: string, options: string[], selectOpts?: Record<string, unknown>) => {
			selectCalls.push({ title, options, opts: selectOpts });
			return opts.selectResult;
		}),
		multiSelect: vi.fn(async () => undefined),
		input: vi.fn(async (prompt: string) => {
			inputCalls.push(prompt);
			return opts.inputResult;
		}),
		confirm: vi.fn(async () => false),
		notify: vi.fn(),
		onTerminalInput: vi.fn(() => () => {}),
		setStatus: vi.fn(),
		setWorkingMessage: vi.fn(),
		setWidget: vi.fn(),
		setTitle: vi.fn(),
		custom: vi.fn(async () => undefined as never),
		setEditorText: vi.fn(),
		pasteToEditor: vi.fn(),
		getEditorText: vi.fn(() => ""),
		editor: vi.fn(async () => undefined),
		get theme(): any {
			return {};
		},
		getAllThemes: vi.fn(async () => []),
		getTheme: vi.fn(async () => undefined),
		setTheme: vi.fn(async () => ({ success: false, error: "test" })),
		setFooter: vi.fn(),
		setHeader: vi.fn(),
		setEditorComponent: vi.fn(),
		getToolsExpanded: vi.fn(() => false),
		setToolsExpanded: vi.fn(),
	};

	return { ui, selectCalls, inputCalls };
}

function singleQuestion(options: string[], recommended?: number) {
	return {
		questions: [
			{
				id: "q1",
				question: "Choose one",
				options: options.map(label => ({ label })),
				recommended,
			},
		],
	};
}

describe("ask tool single-select", () => {
	test("returns selected option", async () => {
		const tool = createAskTool();
		const { ui } = createSingleSelectUI({ selectResult: "Beta" });

		const result = await tool.execute(
			"call-s1",
			singleQuestion(["Alpha", "Beta", "Gamma"]),
			undefined,
			undefined,
			makeContext(ui),
		);

		const details = result.details as AskToolDetails;
		expect(details.selectedOptions).toEqual(["Beta"]);
		expect(details.customInput).toBeUndefined();
		expect(result.content[0]).toHaveProperty("text", "User selected: Beta");
	});

	test("cancel returns empty selection", async () => {
		const tool = createAskTool();
		const { ui } = createSingleSelectUI({ selectResult: undefined });

		const result = await tool.execute(
			"call-s2",
			singleQuestion(["Alpha", "Beta"]),
			undefined,
			undefined,
			makeContext(ui),
		);

		const details = result.details as AskToolDetails;
		expect(details.selectedOptions).toEqual([]);
		expect(details.customInput).toBeUndefined();
		expect(result.content[0]).toHaveProperty("text", "User cancelled the selection");
	});

	test("Other option triggers input prompt", async () => {
		const tool = createAskTool();
		const { ui, inputCalls } = createSingleSelectUI({
			selectResult: OTHER_OPTION,
			inputResult: "my custom answer",
		});

		const result = await tool.execute(
			"call-s3",
			singleQuestion(["Alpha", "Beta"]),
			undefined,
			undefined,
			makeContext(ui),
		);

		const details = result.details as AskToolDetails;
		expect(details.selectedOptions).toEqual([]);
		expect(details.customInput).toBe("my custom answer");
		expect(inputCalls).toEqual(["Enter your response:"]);
		expect(result.content[0]).toHaveProperty("text", "User provided custom input: my custom answer");
	});

	test("Other selected but input cancelled returns no selection and no customInput", async () => {
		const tool = createAskTool();
		const { ui } = createSingleSelectUI({
			selectResult: OTHER_OPTION,
			inputResult: undefined,
		});

		const result = await tool.execute("call-s4", singleQuestion(["Alpha"]), undefined, undefined, makeContext(ui));

		const details = result.details as AskToolDetails;
		expect(details.selectedOptions).toEqual([]);
		expect(details.customInput).toBeUndefined();
	});

	test("recommended option gets suffix in display labels", async () => {
		const tool = createAskTool();
		const { ui, selectCalls } = createSingleSelectUI({ selectResult: undefined });

		await tool.execute(
			"call-s5",
			singleQuestion(["Alpha", "Beta", "Gamma"], 1),
			undefined,
			undefined,
			makeContext(ui),
		);

		expect(selectCalls).toHaveLength(1);
		expect(selectCalls[0].options).toEqual(["Alpha", `Beta${RECOMMENDED_SUFFIX}`, "Gamma", OTHER_OPTION]);
	});

	test("recommended suffix is stripped from the returned selection", async () => {
		const tool = createAskTool();
		const { ui } = createSingleSelectUI({
			selectResult: `Beta${RECOMMENDED_SUFFIX}`,
		});

		const result = await tool.execute(
			"call-s6",
			singleQuestion(["Alpha", "Beta", "Gamma"], 1),
			undefined,
			undefined,
			makeContext(ui),
		);

		const details = result.details as AskToolDetails;
		expect(details.selectedOptions).toEqual(["Beta"]);
		expect(result.content[0]).toHaveProperty("text", "User selected: Beta");
	});

	test("passes initialIndex matching recommended", async () => {
		const tool = createAskTool();
		const { ui, selectCalls } = createSingleSelectUI({ selectResult: undefined });

		await tool.execute("call-s7", singleQuestion(["A", "B", "C"], 2), undefined, undefined, makeContext(ui));

		expect(selectCalls[0].opts).toMatchObject({ initialIndex: 2 });
	});

	test("does not add suffix when no recommended index", async () => {
		const tool = createAskTool();
		const { ui, selectCalls } = createSingleSelectUI({ selectResult: undefined });

		await tool.execute("call-s8", singleQuestion(["Alpha", "Beta"]), undefined, undefined, makeContext(ui));

		expect(selectCalls[0].options).toEqual(["Alpha", "Beta", OTHER_OPTION]);
	});

	test("does not call multiSelect in single-select mode", async () => {
		const tool = createAskTool();
		const { ui } = createSingleSelectUI({ selectResult: "Alpha" });

		await tool.execute("call-s9", singleQuestion(["Alpha", "Beta"]), undefined, undefined, makeContext(ui));

		expect(ui.multiSelect).not.toHaveBeenCalled();
	});

	test("does not call input when a regular option is selected", async () => {
		const tool = createAskTool();
		const { ui, inputCalls } = createSingleSelectUI({ selectResult: "Alpha" });

		await tool.execute("call-s10", singleQuestion(["Alpha", "Beta"]), undefined, undefined, makeContext(ui));

		expect(inputCalls).toHaveLength(0);
	});

	test("passes outline: true to select", async () => {
		const tool = createAskTool();
		const { ui, selectCalls } = createSingleSelectUI({ selectResult: undefined });

		await tool.execute("call-s11", singleQuestion(["X"]), undefined, undefined, makeContext(ui));

		expect(selectCalls[0].opts).toMatchObject({ outline: true });
	});
});
