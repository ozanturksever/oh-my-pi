import { beforeAll, describe, expect, test, vi } from "bun:test";
import { FollowupSuggestionsComponent } from "@oh-my-pi/pi-coding-agent/modes/components/followup-suggestions";
import { InteractiveMode } from "@oh-my-pi/pi-coding-agent/modes/interactive-mode";
import { initTheme } from "@oh-my-pi/pi-coding-agent/modes/theme/theme";

/**
 * Creates a minimal mock context that has enough surface area to exercise
 * startFollowLoop, stopFollowLoop, and autoPickFollowup without booting
 * a real TUI or AgentSession.
 */
function createMockContext(opts?: { loopMaxIterations?: number }) {
	const promptCalls: string[] = [];
	const statusMessages: string[] = [];
	const historyCalls: string[] = [];
	let followLoopActive = false;
	let followLoopFinishPrompt: string | undefined;
	let followLoopIterations = 0;
	let followupSuggestions: Array<{
		prompt: string;
		label?: string;
		priority?: "must-have" | "nice-to-have" | "optional";
	}> = [];
	let followupEnabled = false;
	let activeTools: string[] = [];
	let showFollowupSuggestionsCalled = false;
	let loopMaxIterations = opts?.loopMaxIterations ?? 25;

	const ctx = {
		// State
		get followLoopActive() {
			return followLoopActive;
		},
		set followLoopActive(v: boolean) {
			followLoopActive = v;
		},
		get followLoopFinishPrompt() {
			return followLoopFinishPrompt;
		},
		set followLoopFinishPrompt(v: string | undefined) {
			followLoopFinishPrompt = v;
		},
		get followLoopIterations() {
			return followLoopIterations;
		},
		set followLoopIterations(v: number) {
			followLoopIterations = v;
		},
		get followupSuggestions() {
			return followupSuggestions;
		},
		set followupSuggestions(v: typeof followupSuggestions) {
			followupSuggestions = v;
		},

		// Dependencies
		settings: {
			get(key: string) {
				if (key === "followup.enabled") return followupEnabled;
				if (key === "followup.loopMaxIterations") return loopMaxIterations;
				return undefined;
			},
			set(key: string, value: unknown) {
				if (key === "followup.enabled") followupEnabled = value as boolean;
			},
		},
		session: {
			isStreaming: true,
			getActiveToolNames: () => activeTools,
			setActiveToolsByName: vi.fn(async (tools: string[]) => {
				activeTools = tools;
			}),
			prompt: vi.fn(async (_text: string, _options?: unknown) => {
				promptCalls.push(_text);
			}),
		},
		statusLine: {
			setFollowLoopStatus: vi.fn(),
		},
		editor: {
			addToHistory: vi.fn((text: string) => {
				historyCalls.push(text);
			}),
		},
		ui: {
			requestRender: vi.fn(),
		},

		// Methods called by the implementation
		updateEditorTopBorder: vi.fn(),
		updatePendingMessagesDisplay: vi.fn(),
		showStatus: vi.fn((msg: string) => {
			statusMessages.push(msg);
		}),
		showFollowupSuggestions: vi.fn(() => {
			showFollowupSuggestionsCalled = true;
		}),
		clearFollowupSuggestions: vi.fn(),
		followupSuggestionsComponent: undefined,

		// Bound methods from InteractiveMode.prototype
		startFollowLoop: null as unknown as (finishPrompt?: string) => Promise<void>,
		stopFollowLoop: null as unknown as () => void,
		autoPickFollowup: null as unknown as () => Promise<void>,
	};

	// Bind the real methods from InteractiveMode.prototype to our mock context
	ctx.startFollowLoop = InteractiveMode.prototype.startFollowLoop.bind(ctx as any);
	ctx.stopFollowLoop = InteractiveMode.prototype.stopFollowLoop.bind(ctx as any);
	ctx.autoPickFollowup = InteractiveMode.prototype.autoPickFollowup.bind(ctx as any);

	return {
		ctx,
		promptCalls,
		statusMessages,
		historyCalls,
		get showFollowupSuggestionsCalled() {
			return showFollowupSuggestionsCalled;
		},
		resetShowFollowupSuggestionsCalled() {
			showFollowupSuggestionsCalled = false;
		},
		setFollowupEnabled(v: boolean) {
			followupEnabled = v;
		},
		setActiveTools(tools: string[]) {
			activeTools = tools;
		},
		setLoopMaxIterations(v: number) {
			loopMaxIterations = v;
		},
	};
}

beforeAll(() => {
	initTheme();
});

describe("startFollowLoop", () => {
	test("sets followLoopActive and stores finish prompt", async () => {
		const { ctx } = createMockContext();

		await ctx.startFollowLoop("all tests pass");

		expect(ctx.followLoopActive).toBe(true);
		expect(ctx.followLoopFinishPrompt).toBe("all tests pass");
	});

	test("works without finish prompt", async () => {
		const { ctx } = createMockContext();

		await ctx.startFollowLoop();

		expect(ctx.followLoopActive).toBe(true);
		expect(ctx.followLoopFinishPrompt).toBeUndefined();
	});

	test("resets iteration counter to zero", async () => {
		const { ctx } = createMockContext();
		ctx.followLoopIterations = 5;

		await ctx.startFollowLoop();

		expect(ctx.followLoopIterations).toBe(0);
	});

	test("enables followup suggestions if not already enabled", async () => {
		const mock = createMockContext();
		mock.setFollowupEnabled(false);
		mock.setActiveTools(["bash", "read"]);

		await mock.ctx.startFollowLoop();

		expect(mock.ctx.session.setActiveToolsByName).toHaveBeenCalledWith(["bash", "read", "suggest_followups"]);
	});

	test("does not duplicate suggest_followups tool if already active", async () => {
		const mock = createMockContext();
		mock.setFollowupEnabled(false);
		mock.setActiveTools(["bash", "suggest_followups"]);

		await mock.ctx.startFollowLoop();

		// Should not have been called since tool is already active
		expect(mock.ctx.session.setActiveToolsByName).not.toHaveBeenCalled();
	});

	test("skips enabling when followup already enabled", async () => {
		const mock = createMockContext();
		mock.setFollowupEnabled(true);

		await mock.ctx.startFollowLoop();

		expect(mock.ctx.session.setActiveToolsByName).not.toHaveBeenCalled();
	});

	test("updates status line with follow loop status including iterations", async () => {
		const { ctx } = createMockContext();

		await ctx.startFollowLoop("done");

		expect(ctx.statusLine.setFollowLoopStatus).toHaveBeenCalledWith({
			active: true,
			finishPrompt: "done",
			iterations: 0,
		});
	});

	test("shows status with finish prompt truncated at 60 chars", async () => {
		const { ctx, statusMessages } = createMockContext();
		const longPrompt = "a".repeat(80);

		await ctx.startFollowLoop(longPrompt);

		expect(statusMessages[0]).toContain("Follow loop started (finish:");
		expect(statusMessages[0]).toContain("...");
	});

	test("shows status without truncation for short prompt", async () => {
		const { ctx, statusMessages } = createMockContext();

		await ctx.startFollowLoop("write tests");

		expect(statusMessages[0]).toBe("Follow loop started (finish: write tests)");
	});
});

describe("stopFollowLoop", () => {
	test("clears all follow loop state", async () => {
		const { ctx } = createMockContext();

		await ctx.startFollowLoop("condition");
		ctx.followLoopIterations = 5;
		ctx.stopFollowLoop();

		expect(ctx.followLoopActive).toBe(false);
		expect(ctx.followLoopFinishPrompt).toBeUndefined();
		expect(ctx.followLoopIterations).toBe(0);
	});

	test("clears status line follow loop indicator", async () => {
		const { ctx } = createMockContext();

		await ctx.startFollowLoop();
		ctx.stopFollowLoop();

		expect(ctx.statusLine.setFollowLoopStatus).toHaveBeenLastCalledWith(undefined);
	});

	test("shows stopped status message", async () => {
		const { ctx, statusMessages } = createMockContext();

		ctx.stopFollowLoop();

		expect(statusMessages).toContain("Follow loop stopped");
	});
});

describe("autoPickFollowup", () => {
	test("stops loop when suggestions are empty", async () => {
		const { ctx, statusMessages } = createMockContext();
		ctx.followLoopActive = true;
		ctx.followupSuggestions = [];

		await ctx.autoPickFollowup();

		expect(ctx.followLoopActive).toBe(false);
		expect(statusMessages).toContain("Follow loop stopped");
	});

	test("picks first must-have suggestion and submits it", async () => {
		const { ctx, promptCalls, historyCalls } = createMockContext();
		ctx.followLoopActive = true;
		ctx.followupSuggestions = [
			{ prompt: "nice thing", label: "Nice", priority: "nice-to-have" },
			{ prompt: "critical fix", label: "Fix", priority: "must-have" },
			{ prompt: "another must", priority: "must-have" },
		];

		await ctx.autoPickFollowup();

		// Should pick the first must-have (index 1)
		expect(promptCalls).toEqual(["critical fix"]);
		expect(historyCalls).toEqual(["critical fix"]);
		// Loop should still be active
		expect(ctx.followLoopActive).toBe(true);
	});

	test("removes picked suggestion from the list", async () => {
		const { ctx } = createMockContext();
		ctx.followLoopActive = true;
		ctx.followupSuggestions = [
			{ prompt: "nice thing", priority: "nice-to-have" },
			{ prompt: "critical fix", priority: "must-have" },
			{ prompt: "another nice", priority: "optional" },
		];

		await ctx.autoPickFollowup();

		expect(ctx.followupSuggestions).toHaveLength(2);
		expect(ctx.followupSuggestions.map(s => s.prompt)).toEqual(["nice thing", "another nice"]);
	});

	test("increments iteration counter on each pick", async () => {
		const { ctx } = createMockContext();
		ctx.followLoopActive = true;

		ctx.followupSuggestions = [{ prompt: "first", priority: "must-have" }];
		await ctx.autoPickFollowup();
		expect(ctx.followLoopIterations).toBe(1);

		ctx.followupSuggestions = [{ prompt: "second", priority: "must-have" }];
		await ctx.autoPickFollowup();
		expect(ctx.followLoopIterations).toBe(2);

		ctx.followupSuggestions = [{ prompt: "third", priority: "must-have" }];
		await ctx.autoPickFollowup();
		expect(ctx.followLoopIterations).toBe(3);
	});

	test("includes iteration count in status message", async () => {
		const { ctx, statusMessages } = createMockContext();
		ctx.followLoopActive = true;
		ctx.followupSuggestions = [{ prompt: "fix it", label: "Fix", priority: "must-have" }];

		await ctx.autoPickFollowup();

		const loopMsg = statusMessages.find(m => m.startsWith("Follow loop ("));
		expect(loopMsg).toBe('Follow loop (1): executing "Fix"');
	});

	test("updates status line with current iteration count", async () => {
		const { ctx } = createMockContext();
		ctx.followLoopActive = true;
		ctx.followLoopFinishPrompt = "done";
		ctx.followupSuggestions = [{ prompt: "fix it", priority: "must-have" }];

		await ctx.autoPickFollowup();

		expect(ctx.statusLine.setFollowLoopStatus).toHaveBeenCalledWith({
			active: true,
			finishPrompt: "done",
			iterations: 1,
		});
	});

	test("shows status with label when available", async () => {
		const { ctx, statusMessages } = createMockContext();
		ctx.followLoopActive = true;
		ctx.followupSuggestions = [{ prompt: "do something long", label: "Short Label", priority: "must-have" }];

		await ctx.autoPickFollowup();

		const loopMsg = statusMessages.find(m => m.includes("executing"));
		expect(loopMsg).toContain("Short Label");
	});

	test("shows status with truncated prompt when no label", async () => {
		const { ctx, statusMessages } = createMockContext();
		ctx.followLoopActive = true;
		ctx.followupSuggestions = [{ prompt: "do the thing now please", priority: "must-have" }];

		await ctx.autoPickFollowup();

		const loopMsg = statusMessages.find(m => m.includes("executing"));
		expect(loopMsg).toContain("do the thing now please");
	});

	test("stops loop and sends finish prompt when no must-have and finish prompt set", async () => {
		const { ctx, promptCalls } = createMockContext();
		ctx.followLoopActive = true;
		ctx.followLoopFinishPrompt = "verify everything works";
		ctx.followupSuggestions = [
			{ prompt: "nice thing", priority: "nice-to-have" },
			{ prompt: "optional polish", priority: "optional" },
		];

		await ctx.autoPickFollowup();

		expect(ctx.followLoopActive).toBe(false);
		expect(promptCalls).toEqual(["verify everything works"]);
	});

	test("stops loop and shows selector when no must-have and no finish prompt", async () => {
		const mock = createMockContext();
		mock.ctx.followLoopActive = true;
		mock.ctx.followupSuggestions = [
			{ prompt: "nice thing", priority: "nice-to-have" },
			{ prompt: "optional polish", priority: "optional" },
		];

		await mock.ctx.autoPickFollowup();

		expect(mock.ctx.followLoopActive).toBe(false);
		expect(mock.showFollowupSuggestionsCalled).toBe(true);
		// Should not have sent any prompt
		expect(mock.promptCalls).toHaveLength(0);
	});

	test("stops loop without showing selector when no must-have and no suggestions with no finish prompt", async () => {
		const mock = createMockContext();
		mock.ctx.followLoopActive = true;
		mock.ctx.followupSuggestions = [];

		await mock.ctx.autoPickFollowup();

		expect(mock.ctx.followLoopActive).toBe(false);
		expect(mock.showFollowupSuggestionsCalled).toBe(false);
	});

	test("treats suggestions without priority as non-must-have", async () => {
		const mock = createMockContext();
		mock.ctx.followLoopActive = true;
		mock.ctx.followupSuggestions = [{ prompt: "untagged suggestion" }, { prompt: "another untagged" }];

		await mock.ctx.autoPickFollowup();

		// No must-have found, so loop stops
		expect(mock.ctx.followLoopActive).toBe(false);
		// Selector shown for remaining suggestions
		expect(mock.showFollowupSuggestionsCalled).toBe(true);
		expect(mock.promptCalls).toHaveLength(0);
	});

	test("picks must-have even when mixed with untagged suggestions", async () => {
		const mock = createMockContext();
		mock.ctx.followLoopActive = true;
		mock.ctx.followupSuggestions = [
			{ prompt: "untagged first" },
			{ prompt: "critical item", priority: "must-have" },
			{ prompt: "untagged last" },
		];

		await mock.ctx.autoPickFollowup();

		expect(mock.promptCalls).toEqual(["critical item"]);
		expect(mock.ctx.followLoopActive).toBe(true);
		expect(mock.ctx.followupSuggestions).toHaveLength(2);
		expect(mock.ctx.followupSuggestions.map(s => s.prompt)).toEqual(["untagged first", "untagged last"]);
	});

	test("updates pending messages display after picking a suggestion", async () => {
		const { ctx } = createMockContext();
		ctx.followLoopActive = true;
		ctx.followupSuggestions = [{ prompt: "fix imports", priority: "must-have" }];

		await ctx.autoPickFollowup();

		expect(ctx.updatePendingMessagesDisplay).toHaveBeenCalled();
		expect(ctx.ui.requestRender).toHaveBeenCalled();
	});

	test("clears finish prompt when stopping via finish condition path", async () => {
		const { ctx } = createMockContext();
		ctx.followLoopActive = true;
		ctx.followLoopFinishPrompt = "all tests pass";
		ctx.followupSuggestions = [{ prompt: "polish", priority: "nice-to-have" }];

		await ctx.autoPickFollowup();

		expect(ctx.followLoopActive).toBe(false);
		expect(ctx.followLoopFinishPrompt).toBeUndefined();
	});
});

describe("autoPickFollowup max iteration limit", () => {
	test("stops loop when max iterations reached", async () => {
		const mock = createMockContext({ loopMaxIterations: 3 });
		mock.ctx.followLoopActive = true;
		mock.ctx.followLoopIterations = 3; // already at limit
		mock.ctx.followupSuggestions = [{ prompt: "one more", priority: "must-have" }];

		await mock.ctx.autoPickFollowup();

		expect(mock.ctx.followLoopActive).toBe(false);
		expect(mock.promptCalls).toHaveLength(0); // should NOT execute the must-have
	});

	test("shows max iterations status message", async () => {
		const mock = createMockContext({ loopMaxIterations: 5 });
		mock.ctx.followLoopActive = true;
		mock.ctx.followLoopIterations = 5;
		mock.ctx.followupSuggestions = [{ prompt: "more work", priority: "must-have" }];

		await mock.ctx.autoPickFollowup();

		expect(mock.statusMessages).toContain("Follow loop: reached max iterations (5)");
	});

	test("shows selector for remaining suggestions after hitting limit", async () => {
		const mock = createMockContext({ loopMaxIterations: 2 });
		mock.ctx.followLoopActive = true;
		mock.ctx.followLoopIterations = 2;
		mock.ctx.followupSuggestions = [
			{ prompt: "critical", priority: "must-have" },
			{ prompt: "nice", priority: "nice-to-have" },
		];

		await mock.ctx.autoPickFollowup();

		expect(mock.showFollowupSuggestionsCalled).toBe(true);
	});

	test("allows unlimited iterations when max is 0", async () => {
		const mock = createMockContext({ loopMaxIterations: 0 });
		mock.ctx.followLoopActive = true;
		mock.ctx.followLoopIterations = 100;
		mock.ctx.followupSuggestions = [{ prompt: "keep going", priority: "must-have" }];

		await mock.ctx.autoPickFollowup();

		// Should still execute - 0 means unlimited
		expect(mock.promptCalls).toEqual(["keep going"]);
		expect(mock.ctx.followLoopActive).toBe(true);
		expect(mock.ctx.followLoopIterations).toBe(101);
	});

	test("executes when under the limit", async () => {
		const mock = createMockContext({ loopMaxIterations: 5 });
		mock.ctx.followLoopActive = true;
		mock.ctx.followLoopIterations = 4; // one below limit
		mock.ctx.followupSuggestions = [{ prompt: "last one", priority: "must-have" }];

		await mock.ctx.autoPickFollowup();

		expect(mock.promptCalls).toEqual(["last one"]);
		expect(mock.ctx.followLoopIterations).toBe(5);
		expect(mock.ctx.followLoopActive).toBe(true);
	});

	test("stops at limit on the very next pick", async () => {
		const mock = createMockContext({ loopMaxIterations: 2 });
		mock.ctx.followLoopActive = true;

		// Pick 1
		mock.ctx.followupSuggestions = [{ prompt: "first", priority: "must-have" }];
		await mock.ctx.autoPickFollowup();
		expect(mock.ctx.followLoopIterations).toBe(1);
		expect(mock.ctx.followLoopActive).toBe(true);

		// Pick 2
		mock.ctx.followupSuggestions = [{ prompt: "second", priority: "must-have" }];
		await mock.ctx.autoPickFollowup();
		expect(mock.ctx.followLoopIterations).toBe(2);
		expect(mock.ctx.followLoopActive).toBe(true);

		// Pick 3 - should be blocked
		mock.ctx.followupSuggestions = [{ prompt: "third", priority: "must-have" }];
		await mock.ctx.autoPickFollowup();
		expect(mock.ctx.followLoopActive).toBe(false);
		expect(mock.promptCalls).toEqual(["first", "second"]); // third NOT executed
	});
});

describe("follow loop integration", () => {
	test("full cycle: start -> pick must-haves -> exhaust -> stop", async () => {
		const mock = createMockContext();
		mock.setFollowupEnabled(true);

		// Start the loop
		await mock.ctx.startFollowLoop();
		expect(mock.ctx.followLoopActive).toBe(true);
		expect(mock.ctx.followLoopIterations).toBe(0);

		// Simulate agent completing with must-have suggestions
		mock.ctx.followupSuggestions = [
			{ prompt: "write tests", priority: "must-have" },
			{ prompt: "add docs", priority: "nice-to-have" },
		];

		// First pick - should take must-have
		await mock.ctx.autoPickFollowup();
		expect(mock.promptCalls).toEqual(["write tests"]);
		expect(mock.ctx.followLoopActive).toBe(true);
		expect(mock.ctx.followLoopIterations).toBe(1);

		// Simulate agent completing again — no must-haves left
		mock.ctx.followupSuggestions = [{ prompt: "polish readme", priority: "optional" }];

		// Second pick - no must-have, loop stops
		await mock.ctx.autoPickFollowup();
		expect(mock.ctx.followLoopActive).toBe(false);
		expect(mock.showFollowupSuggestionsCalled).toBe(true);
	});

	test("full cycle with finish prompt: start -> pick must-haves -> finish prompt sent", async () => {
		const mock = createMockContext();
		mock.setFollowupEnabled(true);

		await mock.ctx.startFollowLoop("confirm all tests pass");
		expect(mock.ctx.followLoopActive).toBe(true);

		// Simulate agent completing — only nice-to-haves
		mock.ctx.followupSuggestions = [{ prompt: "refactor", priority: "nice-to-have" }];

		await mock.ctx.autoPickFollowup();
		expect(mock.ctx.followLoopActive).toBe(false);
		expect(mock.promptCalls).toEqual(["confirm all tests pass"]);
	});

	test("full cycle with max iterations: start -> pick until limit -> stop", async () => {
		const mock = createMockContext({ loopMaxIterations: 2 });
		mock.setFollowupEnabled(true);

		await mock.ctx.startFollowLoop();

		// Pick 1
		mock.ctx.followupSuggestions = [{ prompt: "task 1", priority: "must-have" }];
		await mock.ctx.autoPickFollowup();
		expect(mock.ctx.followLoopIterations).toBe(1);

		// Pick 2
		mock.ctx.followupSuggestions = [{ prompt: "task 2", priority: "must-have" }];
		await mock.ctx.autoPickFollowup();
		expect(mock.ctx.followLoopIterations).toBe(2);

		// Pick 3 - blocked by limit
		mock.ctx.followupSuggestions = [{ prompt: "task 3", priority: "must-have" }];
		await mock.ctx.autoPickFollowup();
		expect(mock.ctx.followLoopActive).toBe(false);
		expect(mock.promptCalls).toEqual(["task 1", "task 2"]);
		expect(mock.statusMessages).toContain("Follow loop: reached max iterations (2)");
	});

	test("iteration counter resets when restarting loop", async () => {
		const mock = createMockContext();
		mock.setFollowupEnabled(true);

		await mock.ctx.startFollowLoop();
		mock.ctx.followupSuggestions = [{ prompt: "work", priority: "must-have" }];
		await mock.ctx.autoPickFollowup();
		expect(mock.ctx.followLoopIterations).toBe(1);

		// Stop and restart
		mock.ctx.stopFollowLoop();
		expect(mock.ctx.followLoopIterations).toBe(0);

		await mock.ctx.startFollowLoop();
		expect(mock.ctx.followLoopIterations).toBe(0);

		mock.ctx.followupSuggestions = [{ prompt: "fresh work", priority: "must-have" }];
		await mock.ctx.autoPickFollowup();
		expect(mock.ctx.followLoopIterations).toBe(1);
	});
});

describe("/followloop status subcommand", () => {
	function createStatusMockRuntime(ctxOverrides: Record<string, unknown> = {}) {
		const statusCalls: Array<{ message: string; options?: { dim?: boolean } }> = [];
		const ctx = {
			followLoopActive: false,
			followLoopIterations: 0,
			followLoopFinishPrompt: undefined as string | undefined,
			followupSuggestions: [] as Array<{
				prompt: string;
				label?: string;
				priority?: "must-have" | "nice-to-have" | "optional";
			}>,
			settings: {
				get(key: string) {
					if (key === "followup.loopMaxIterations") return 25;
					return undefined;
				},
			},
			editor: { setText: vi.fn() },
			showStatus: vi.fn((message: string, options?: { dim?: boolean }) => {
				statusCalls.push({ message, options });
			}),
			stopFollowLoop: vi.fn(),
			startFollowLoop: vi.fn(),
			...ctxOverrides,
		};
		const runtime = { ctx, handleBackgroundCommand: vi.fn() };
		return { runtime: runtime as any, ctx, statusCalls };
	}

	test("shows inactive when loop is not running", async () => {
		const { runtime, statusCalls } = createStatusMockRuntime();

		const { executeBuiltinSlashCommand } = await import("@oh-my-pi/pi-coding-agent/slash-commands/builtin-registry");
		const handled = await executeBuiltinSlashCommand("/followloop status", runtime);

		expect(handled).toBe(true);
		expect(statusCalls).toHaveLength(1);
		expect(statusCalls[0].message).toBe("Follow loop: inactive");
	});

	test("shows active state with iteration count", async () => {
		const { runtime, statusCalls } = createStatusMockRuntime({
			followLoopActive: true,
			followLoopIterations: 7,
		});

		const { executeBuiltinSlashCommand } = await import("@oh-my-pi/pi-coding-agent/slash-commands/builtin-registry");
		await executeBuiltinSlashCommand("/followloop status", runtime);

		expect(statusCalls).toHaveLength(1);
		expect(statusCalls[0].message).toContain("Follow loop: active (iteration 7)");
		expect(statusCalls[0].options?.dim).toBe(false);
	});

	test("shows finish condition when set", async () => {
		const { runtime, statusCalls } = createStatusMockRuntime({
			followLoopActive: true,
			followLoopIterations: 3,
			followLoopFinishPrompt: "all tests pass",
		});

		const { executeBuiltinSlashCommand } = await import("@oh-my-pi/pi-coding-agent/slash-commands/builtin-registry");
		await executeBuiltinSlashCommand("/followloop status", runtime);

		expect(statusCalls[0].message).toContain("Finish condition: all tests pass");
	});

	test("shows max iterations setting", async () => {
		const { runtime, statusCalls } = createStatusMockRuntime({
			followLoopActive: true,
			followLoopIterations: 0,
			settings: {
				get(key: string) {
					if (key === "followup.loopMaxIterations") return 10;
					return undefined;
				},
			},
		});

		const { executeBuiltinSlashCommand } = await import("@oh-my-pi/pi-coding-agent/slash-commands/builtin-registry");
		await executeBuiltinSlashCommand("/followloop status", runtime);

		expect(statusCalls[0].message).toContain("Max iterations: 10");
	});

	test("shows unlimited when max is 0", async () => {
		const { runtime, statusCalls } = createStatusMockRuntime({
			followLoopActive: true,
			followLoopIterations: 0,
			settings: {
				get(key: string) {
					if (key === "followup.loopMaxIterations") return 0;
					return undefined;
				},
			},
		});

		const { executeBuiltinSlashCommand } = await import("@oh-my-pi/pi-coding-agent/slash-commands/builtin-registry");
		await executeBuiltinSlashCommand("/followloop status", runtime);

		expect(statusCalls[0].message).toContain("Max iterations: unlimited");
	});

	test("shows pending suggestions count with must-have breakdown", async () => {
		const { runtime, statusCalls } = createStatusMockRuntime({
			followLoopActive: true,
			followLoopIterations: 2,
			followupSuggestions: [
				{ prompt: "fix imports", label: "Fix imports", priority: "must-have" },
				{ prompt: "add tests for edge cases", priority: "must-have" },
				{ prompt: "polish readme", priority: "nice-to-have" },
			],
		});

		const { executeBuiltinSlashCommand } = await import("@oh-my-pi/pi-coding-agent/slash-commands/builtin-registry");
		await executeBuiltinSlashCommand("/followloop status", runtime);

		const msg = statusCalls[0].message;
		expect(msg).toContain("Pending suggestions: 3 (2 must-have)");
		expect(msg).toContain("- Fix imports");
		expect(msg).toContain("- add tests for edge cases");
		expect(msg).not.toContain("polish readme");
	});

	test("shows zero must-haves when none exist", async () => {
		const { runtime, statusCalls } = createStatusMockRuntime({
			followLoopActive: true,
			followLoopIterations: 1,
			followupSuggestions: [{ prompt: "optional thing", priority: "optional" }],
		});

		const { executeBuiltinSlashCommand } = await import("@oh-my-pi/pi-coding-agent/slash-commands/builtin-registry");
		await executeBuiltinSlashCommand("/followloop status", runtime);

		expect(statusCalls[0].message).toContain("Pending suggestions: 1 (0 must-have)");
	});

	test("clears editor after showing status", async () => {
		const { runtime, ctx } = createStatusMockRuntime({ followLoopActive: true, followLoopIterations: 0 });

		const { executeBuiltinSlashCommand } = await import("@oh-my-pi/pi-coding-agent/slash-commands/builtin-registry");
		await executeBuiltinSlashCommand("/followloop status", runtime);

		expect(ctx.editor.setText).toHaveBeenCalledWith("");
	});

	test("uses label for must-have display, falls back to truncated prompt", async () => {
		const { runtime, statusCalls } = createStatusMockRuntime({
			followLoopActive: true,
			followLoopIterations: 0,
			followupSuggestions: [
				{ prompt: "a".repeat(100), priority: "must-have" },
				{ prompt: "short", label: "Short Label", priority: "must-have" },
			],
		});

		const { executeBuiltinSlashCommand } = await import("@oh-my-pi/pi-coding-agent/slash-commands/builtin-registry");
		await executeBuiltinSlashCommand("/followloop status", runtime);

		const msg = statusCalls[0].message;
		// First must-have uses truncated prompt (70 chars)
		expect(msg).toContain(`- ${"a".repeat(70)}`);
		expect(msg).not.toContain("a".repeat(100));
		// Second uses label
		expect(msg).toContain("- Short Label");
	});
});

describe("event-controller agent_end branching", () => {
	function createEventControllerMocks(opts: {
		followLoopActive: boolean;
		followupSuggestions: Array<{ prompt: string; priority?: string }>;
	}) {
		const autoPickFollowup = vi.fn(async () => {});
		const showFollowupSuggestions = vi.fn(() => {});
		const ctx = {
			loadingAnimation: undefined as any,
			statusContainer: { clear: vi.fn() },
			streamingComponent: undefined as any,
			streamingMessage: undefined as any,
			chatContainer: { removeChild: vi.fn() },
			flushPendingModelSwitch: vi.fn(async () => {}),
			pendingTools: new Map(),
			ui: { requestRender: vi.fn() },
			isBackgrounded: false,
			sessionManager: { getSessionName: () => "test" },
			followupSuggestions: opts.followupSuggestions,
			followLoopActive: opts.followLoopActive,
			autoPickFollowup,
			showFollowupSuggestions,
			clearFollowupSuggestions: vi.fn(),
			followupSuggestionsComponent: undefined,
			isInitialized: true,
			statusLine: { invalidate: vi.fn() },
			updateEditorTopBorder: vi.fn(),
		} as any;
		return { ctx, autoPickFollowup, showFollowupSuggestions };
	}

	test("calls autoPickFollowup when followLoopActive is true and suggestions exist", async () => {
		const { ctx, autoPickFollowup, showFollowupSuggestions } = createEventControllerMocks({
			followLoopActive: true,
			followupSuggestions: [{ prompt: "fix it", priority: "must-have" }],
		});
		const { EventController } = await import("@oh-my-pi/pi-coding-agent/modes/controllers/event-controller");
		const controller = new EventController(ctx);
		await controller.handleEvent({ type: "agent_end" } as any);

		// Need a microtask tick for the void promise
		await Bun.sleep(0);

		expect(autoPickFollowup).toHaveBeenCalledTimes(1);
		expect(showFollowupSuggestions).not.toHaveBeenCalled();
	});

	test("calls showFollowupSuggestions when followLoopActive is false and suggestions exist", async () => {
		const { ctx, autoPickFollowup, showFollowupSuggestions } = createEventControllerMocks({
			followLoopActive: false,
			followupSuggestions: [{ prompt: "add docs", priority: "nice-to-have" }],
		});
		const { EventController } = await import("@oh-my-pi/pi-coding-agent/modes/controllers/event-controller");
		const controller = new EventController(ctx);
		await controller.handleEvent({ type: "agent_end" } as any);

		await Bun.sleep(0);

		expect(showFollowupSuggestions).toHaveBeenCalledTimes(1);
		expect(autoPickFollowup).not.toHaveBeenCalled();
	});

	test("calls neither when followupSuggestions is empty regardless of loop state", async () => {
		for (const loopActive of [true, false]) {
			const { ctx, autoPickFollowup, showFollowupSuggestions } = createEventControllerMocks({
				followLoopActive: loopActive,
				followupSuggestions: [],
			});
			const { EventController } = await import("@oh-my-pi/pi-coding-agent/modes/controllers/event-controller");
			const controller = new EventController(ctx);
			await controller.handleEvent({ type: "agent_end" } as any);

			await Bun.sleep(0);

			expect(autoPickFollowup).not.toHaveBeenCalled();
			expect(showFollowupSuggestions).not.toHaveBeenCalled();
		}
	});
});

describe("showFollowupSuggestions inline", () => {
	function createInlineSuggestionsMock() {
		const promptCalls: Array<{ text: string; opts?: unknown }> = [];
		const historyCalls: string[] = [];
		let followupSuggestions: Array<{
			prompt: string;
			label?: string;
			priority?: "must-have" | "nice-to-have" | "optional";
		}> = [];
		const removedChildren: unknown[] = [];

		const ctx = {
			get followupSuggestions() {
				return followupSuggestions;
			},
			set followupSuggestions(v: typeof followupSuggestions) {
				followupSuggestions = v;
			},
			followupSuggestionsComponent: undefined as any,
			session: {
				isStreaming: false,
				prompt: vi.fn(async (text: string, opts?: unknown) => {
					promptCalls.push({ text, opts });
				}),
			},
			editor: {
				addToHistory: vi.fn((text: string) => {
					historyCalls.push(text);
				}),
			},
			ui: { requestRender: vi.fn() },
			updatePendingMessagesDisplay: vi.fn(),
			chatContainer: {
				addChild: vi.fn(),
				removeChild: vi.fn((child: unknown) => {
					removedChildren.push(child);
				}),
			},
			showFollowupSuggestions: null as unknown as () => void,
			clearFollowupSuggestions: null as unknown as () => void,
		};

		ctx.showFollowupSuggestions = InteractiveMode.prototype.showFollowupSuggestions.bind(ctx as any);
		ctx.clearFollowupSuggestions = InteractiveMode.prototype.clearFollowupSuggestions.bind(ctx as any);

		return {
			ctx,
			promptCalls,
			historyCalls,
			get removedChildren() {
				return removedChildren;
			},
			setSuggestions(v: typeof followupSuggestions) {
				followupSuggestions = v;
			},
		};
	}

	test("does nothing when no suggestions", () => {
		const mock = createInlineSuggestionsMock();
		mock.setSuggestions([]);

		mock.ctx.showFollowupSuggestions();

		expect(mock.ctx.chatContainer.addChild).not.toHaveBeenCalled();
		expect(mock.ctx.followupSuggestionsComponent).toBeUndefined();
	});

	test("renders component to chat container", () => {
		const mock = createInlineSuggestionsMock();
		mock.setSuggestions([
			{ prompt: "fix imports", label: "Fix imports" },
			{ prompt: "add tests", label: "Add tests" },
		]);

		mock.ctx.showFollowupSuggestions();

		expect(mock.ctx.followupSuggestionsComponent).toBeDefined();
		expect(mock.ctx.chatContainer.addChild).toHaveBeenCalled();
		expect(mock.ctx.ui.requestRender).toHaveBeenCalled();
	});

	test("toggle + confirm sends single selected prompt", () => {
		const mock = createInlineSuggestionsMock();
		mock.setSuggestions([
			{ prompt: "fix imports", label: "Fix imports" },
			{ prompt: "add tests", label: "Add tests" },
		]);

		mock.ctx.showFollowupSuggestions();
		const comp = mock.ctx.followupSuggestionsComponent;
		expect(comp).toBeDefined();

		// Toggle first, then confirm
		comp.toggle(0);
		comp.confirmSelection();

		expect(mock.promptCalls).toHaveLength(1);
		expect(mock.promptCalls[0].text).toBe("fix imports");
		expect(mock.historyCalls).toEqual(["fix imports"]);
		// Selected removed, one remains
		expect(mock.ctx.followupSuggestions).toHaveLength(1);
		expect(mock.ctx.followupSuggestions[0].prompt).toBe("add tests");
	});

	test("multi-select joins prompts with double newline", () => {
		const mock = createInlineSuggestionsMock();
		mock.setSuggestions([
			{ prompt: "A", label: "A" },
			{ prompt: "B", label: "B" },
			{ prompt: "C", label: "C" },
		]);

		mock.ctx.showFollowupSuggestions();
		const comp = mock.ctx.followupSuggestionsComponent;
		comp.toggle(0);
		comp.toggle(2);
		comp.confirmSelection();

		expect(mock.promptCalls).toHaveLength(1);
		expect(mock.promptCalls[0].text).toBe("A\n\nC");
		expect(mock.historyCalls).toEqual(["A", "C"]);
		// B remains
		expect(mock.ctx.followupSuggestions).toHaveLength(1);
		expect(mock.ctx.followupSuggestions[0].prompt).toBe("B");
	});

	test("toggle twice unchecks an item", () => {
		const mock = createInlineSuggestionsMock();
		mock.setSuggestions([{ prompt: "A" }, { prompt: "B" }]);

		mock.ctx.showFollowupSuggestions();
		const comp = mock.ctx.followupSuggestionsComponent;
		comp.toggle(0);
		expect(comp.checkedIndices).toEqual([0]);
		comp.toggle(0);
		expect(comp.checkedIndices).toEqual([]);
	});

	test("uses followUp streaming behavior when session is streaming", () => {
		const mock = createInlineSuggestionsMock();
		(mock.ctx.session as any).isStreaming = true;
		mock.setSuggestions([{ prompt: "task A", label: "A" }]);

		mock.ctx.showFollowupSuggestions();
		const comp = mock.ctx.followupSuggestionsComponent;
		comp.toggle(0);
		comp.confirmSelection();

		expect(mock.ctx.session.prompt).toHaveBeenCalledWith("task A", { streamingBehavior: "followUp" });
	});

	test("confirming clears component from chat", () => {
		const mock = createInlineSuggestionsMock();
		mock.setSuggestions([{ prompt: "fix it" }]);

		mock.ctx.showFollowupSuggestions();
		const comp = mock.ctx.followupSuggestionsComponent;
		comp.toggle(0);
		comp.confirmSelection();

		expect(mock.ctx.followupSuggestionsComponent).toBeUndefined();
	});

	test("out-of-bounds toggle is ignored", () => {
		const mock = createInlineSuggestionsMock();
		mock.setSuggestions([{ prompt: "only one" }]);

		mock.ctx.showFollowupSuggestions();
		const comp = mock.ctx.followupSuggestionsComponent;
		comp.toggle(5);
		expect(comp.checkedIndices).toEqual([]);
	});

	test("moveDown cycles through suggestions", () => {
		const mock = createInlineSuggestionsMock();
		mock.setSuggestions([{ prompt: "A" }, { prompt: "B" }, { prompt: "C" }]);

		mock.ctx.showFollowupSuggestions();
		const comp = mock.ctx.followupSuggestionsComponent;

		expect(comp.focusedIndex).toBe(-1);
		comp.moveDown();
		expect(comp.focusedIndex).toBe(0);
		comp.moveDown();
		expect(comp.focusedIndex).toBe(1);
		comp.moveDown();
		expect(comp.focusedIndex).toBe(2);
		// Wraps around
		comp.moveDown();
		expect(comp.focusedIndex).toBe(0);
	});

	test("moveUp cycles through suggestions", () => {
		const mock = createInlineSuggestionsMock();
		mock.setSuggestions([{ prompt: "A" }, { prompt: "B" }, { prompt: "C" }]);

		mock.ctx.showFollowupSuggestions();
		const comp = mock.ctx.followupSuggestionsComponent;

		// From -1, up goes to last
		comp.moveUp();
		expect(comp.focusedIndex).toBe(2);
		comp.moveUp();
		expect(comp.focusedIndex).toBe(1);
		comp.moveUp();
		expect(comp.focusedIndex).toBe(0);
		// Wraps to last
		comp.moveUp();
		expect(comp.focusedIndex).toBe(2);
	});

	test("confirmSelection with no checked items sends focused item", () => {
		const mock = createInlineSuggestionsMock();
		mock.setSuggestions([{ prompt: "A" }, { prompt: "B" }]);

		mock.ctx.showFollowupSuggestions();
		const comp = mock.ctx.followupSuggestionsComponent;

		comp.moveDown(); // focus 0
		comp.moveDown(); // focus 1
		const handled = comp.confirmSelection();

		expect(handled).toBe(true);
		expect(mock.promptCalls).toHaveLength(1);
		expect(mock.promptCalls[0].text).toBe("B");
	});

	test("confirmSelection prefers checked over focused", () => {
		const mock = createInlineSuggestionsMock();
		mock.setSuggestions([{ prompt: "A" }, { prompt: "B" }, { prompt: "C" }]);

		mock.ctx.showFollowupSuggestions();
		const comp = mock.ctx.followupSuggestionsComponent;

		comp.toggle(0); // check A, focuses 0
		comp.moveDown(); // focus 1 (B not checked)
		const handled = comp.confirmSelection();

		// Should send only the checked item (A), not the focused (B)
		expect(handled).toBe(true);
		expect(mock.promptCalls).toHaveLength(1);
		expect(mock.promptCalls[0].text).toBe("A");
	});

	test("confirmSelection returns false when nothing focused or checked", () => {
		const mock = createInlineSuggestionsMock();
		mock.setSuggestions([{ prompt: "A" }]);

		mock.ctx.showFollowupSuggestions();
		const comp = mock.ctx.followupSuggestionsComponent;

		const handled = comp.confirmSelection();
		expect(handled).toBe(false);
		expect(mock.promptCalls).toHaveLength(0);
	});

	test("moveDown returns false when no suggestions", () => {
		const comp = new FollowupSuggestionsComponent([], () => {});
		expect(comp.moveDown()).toBe(false);
		expect(comp.moveUp()).toBe(false);
	});
});
