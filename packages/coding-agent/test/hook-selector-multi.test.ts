import { beforeAll, describe, expect, test, vi } from "bun:test";
import { HookSelectorComponent } from "@oh-my-pi/pi-coding-agent/modes/components/hook-selector";
import { initTheme, theme } from "@oh-my-pi/pi-coding-agent/modes/theme/theme";

const ANSI_RE = /\x1b\[[0-9;]*m/g;
const strip = (s: string) => s.replace(ANSI_RE, "");

const RENDER_WIDTH = 80;

beforeAll(() => {
	initTheme();
});

function createMultiSelector(
	options: string[],
	opts?: { initialIndex?: number },
): {
	component: HookSelectorComponent;
	onSelect: ReturnType<typeof vi.fn>;
	onCancel: ReturnType<typeof vi.fn>;
	onMultiSelect: ReturnType<typeof vi.fn>;
	/** Return rendered lines with ANSI stripped, filtered to only option lines (containing checkbox symbols). */
	getOptionLines: () => string[];
	/** Return all rendered lines with ANSI stripped. */
	getAllLines: () => string[];
} {
	const onSelect = vi.fn();
	const onCancel = vi.fn();
	const onMultiSelect = vi.fn();

	const component = new HookSelectorComponent("Test", options, onSelect, onCancel, {
		multi: true,
		initialIndex: opts?.initialIndex ?? 0,
	});
	component.setOnMultiSelect(onMultiSelect);

	const checked = theme.checkbox.checked;
	const unchecked = theme.checkbox.unchecked;

	return {
		component,
		onSelect,
		onCancel,
		onMultiSelect,
		getOptionLines() {
			const lines = component.render(RENDER_WIDTH);
			return lines.map(strip).filter(l => l.includes(checked) || l.includes(unchecked));
		},
		getAllLines() {
			return component.render(RENDER_WIDTH).map(strip);
		},
	};
}

describe("HookSelectorComponent multi-select", () => {
	describe("initial rendering", () => {
		test("shows unchecked checkboxes for all options", () => {
			const { getOptionLines } = createMultiSelector(["Alpha", "Beta", "Gamma"]);
			const lines = getOptionLines();

			expect(lines).toHaveLength(3);
			for (const line of lines) {
				expect(line).toContain(theme.checkbox.unchecked);
				expect(line).not.toContain(theme.checkbox.checked);
			}
		});

		test("shows cursor on first item by default", () => {
			const { getOptionLines } = createMultiSelector(["Alpha", "Beta"]);
			const lines = getOptionLines();

			expect(lines[0]).toContain(theme.nav.cursor);
			expect(lines[1]).not.toContain(theme.nav.cursor);
		});

		test("shows cursor on initialIndex item", () => {
			const { getOptionLines } = createMultiSelector(["Alpha", "Beta", "Gamma"], { initialIndex: 2 });
			const lines = getOptionLines();

			expect(lines[2]).toContain(theme.nav.cursor);
			expect(lines[0]).not.toContain(theme.nav.cursor);
		});

		test("shows multi-select help text", () => {
			const { getAllLines } = createMultiSelector(["Alpha"]);
			const allText = getAllLines().join("\n");

			expect(allText).toContain("space toggle");
			expect(allText).toContain("a all");
			expect(allText).toContain("enter confirm");
		});

		test("includes option text in rendered lines", () => {
			const { getOptionLines } = createMultiSelector(["Fix imports", "Add tests"]);
			const lines = getOptionLines();

			expect(lines[0]).toContain("Fix imports");
			expect(lines[1]).toContain("Add tests");
		});
	});

	describe("space toggles", () => {
		test("space checks the item at cursor", () => {
			const { component, getOptionLines } = createMultiSelector(["Alpha", "Beta", "Gamma"]);

			component.handleInput(" ");
			const lines = getOptionLines();

			expect(lines[0]).toContain(theme.checkbox.checked);
			expect(lines[1]).toContain(theme.checkbox.unchecked);
			expect(lines[2]).toContain(theme.checkbox.unchecked);
		});

		test("space on a checked item unchecks it", () => {
			const { component, getOptionLines } = createMultiSelector(["Alpha", "Beta"]);

			component.handleInput(" "); // check
			expect(getOptionLines()[0]).toContain(theme.checkbox.checked);

			component.handleInput(" "); // uncheck
			expect(getOptionLines()[0]).toContain(theme.checkbox.unchecked);
		});

		test("can check multiple items by navigating", () => {
			const { component, getOptionLines } = createMultiSelector(["A", "B", "C"]);

			component.handleInput(" "); // check A
			component.handleInput("j"); // move down
			component.handleInput("j"); // move down
			component.handleInput(" "); // check C

			const lines = getOptionLines();
			expect(lines[0]).toContain(theme.checkbox.checked);
			expect(lines[1]).toContain(theme.checkbox.unchecked);
			expect(lines[2]).toContain(theme.checkbox.checked);
		});

		test("space does not trigger any callback", () => {
			const { component, onSelect, onCancel, onMultiSelect } = createMultiSelector(["Alpha"]);

			component.handleInput(" ");

			expect(onSelect).not.toHaveBeenCalled();
			expect(onCancel).not.toHaveBeenCalled();
			expect(onMultiSelect).not.toHaveBeenCalled();
		});

		test("space is ignored in single-select mode", () => {
			const onSelect = vi.fn();
			const onCancel = vi.fn();
			const component = new HookSelectorComponent("Test", ["Alpha", "Beta"], onSelect, onCancel);

			component.handleInput(" ");

			// In single-select, space has no effect — no callback triggered
			expect(onSelect).not.toHaveBeenCalled();
			expect(onCancel).not.toHaveBeenCalled();
		});
	});

	describe("select all toggle (a key)", () => {
		test("a selects all items", () => {
			const { component, getOptionLines } = createMultiSelector(["A", "B", "C"]);

			component.handleInput("a");
			const lines = getOptionLines();

			for (const line of lines) {
				expect(line).toContain(theme.checkbox.checked);
			}
		});

		test("a deselects all when all are already selected", () => {
			const { component, getOptionLines } = createMultiSelector(["A", "B", "C"]);

			component.handleInput("a"); // select all
			component.handleInput("a"); // deselect all

			const lines = getOptionLines();
			for (const line of lines) {
				expect(line).toContain(theme.checkbox.unchecked);
			}
		});

		test("a selects all when some are checked", () => {
			const { component, getOptionLines } = createMultiSelector(["A", "B", "C"]);

			component.handleInput(" "); // check A only
			component.handleInput("a"); // should select all (since not all are checked)

			const lines = getOptionLines();
			for (const line of lines) {
				expect(line).toContain(theme.checkbox.checked);
			}
		});

		test("a is ignored in single-select mode", () => {
			const onSelect = vi.fn();
			const onCancel = vi.fn();
			const component = new HookSelectorComponent("Test", ["A", "B"], onSelect, onCancel);

			component.handleInput("a");

			expect(onSelect).not.toHaveBeenCalled();
			expect(onCancel).not.toHaveBeenCalled();
		});
	});

	describe("enter with checked items", () => {
		test("enter calls onMultiSelect with checked items in order", () => {
			const { component, onMultiSelect } = createMultiSelector(["A", "B", "C"]);

			// Check C then A (out of order)
			component.handleInput("j"); // down to B
			component.handleInput("j"); // down to C
			component.handleInput(" "); // check C
			component.handleInput("k"); // up to B
			component.handleInput("k"); // up to A
			component.handleInput(" "); // check A

			component.handleInput("\n"); // enter

			expect(onMultiSelect).toHaveBeenCalledTimes(1);
			expect(onMultiSelect).toHaveBeenCalledWith(["A", "C"]); // sorted by index
		});

		test("enter with single checked item returns array of one", () => {
			const { component, onMultiSelect } = createMultiSelector(["A", "B", "C"]);

			component.handleInput("j"); // down to B
			component.handleInput(" "); // check B
			component.handleInput("\n");

			expect(onMultiSelect).toHaveBeenCalledWith(["B"]);
		});

		test("enter with all checked returns all items", () => {
			const { component, onMultiSelect } = createMultiSelector(["X", "Y", "Z"]);

			component.handleInput("a"); // select all
			component.handleInput("\n");

			expect(onMultiSelect).toHaveBeenCalledWith(["X", "Y", "Z"]);
		});

		test("enter does not call onSelect when onMultiSelect is set", () => {
			const { component, onSelect, onMultiSelect } = createMultiSelector(["A", "B"]);

			component.handleInput(" "); // check A
			component.handleInput("\n");

			expect(onMultiSelect).toHaveBeenCalledTimes(1);
			expect(onSelect).not.toHaveBeenCalled();
		});
	});

	describe("enter with no checked items (single-pick shortcut)", () => {
		test("enter with nothing checked calls onMultiSelect with cursor item", () => {
			const { component, onMultiSelect } = createMultiSelector(["A", "B", "C"]);

			component.handleInput("j"); // cursor on B
			component.handleInput("\n");

			expect(onMultiSelect).toHaveBeenCalledWith(["B"]);
		});

		test("enter with nothing checked and cursor on first item", () => {
			const { component, onMultiSelect } = createMultiSelector(["Alpha", "Beta"]);

			component.handleInput("\n");

			expect(onMultiSelect).toHaveBeenCalledWith(["Alpha"]);
		});

		test("falls back to onSelect when onMultiSelect is not set", () => {
			const onSelect = vi.fn();
			const onCancel = vi.fn();
			const component = new HookSelectorComponent("Test", ["A", "B"], onSelect, onCancel, { multi: true });
			// Deliberately NOT calling setOnMultiSelect

			component.handleInput("\n");

			expect(onSelect).toHaveBeenCalledWith("A");
		});
	});

	describe("cancel", () => {
		test("escape calls onCancel", () => {
			const { component, onCancel, onMultiSelect } = createMultiSelector(["A", "B"]);

			component.handleInput(" "); // check something
			component.handleInput("\x1b"); // escape

			expect(onCancel).toHaveBeenCalledTimes(1);
			expect(onMultiSelect).not.toHaveBeenCalled();
		});

		test("ctrl+c calls onCancel", () => {
			const { component, onCancel } = createMultiSelector(["A"]);

			component.handleInput("\x03"); // ctrl+c

			expect(onCancel).toHaveBeenCalledTimes(1);
		});
	});

	describe("help text updates", () => {
		test("shows selection count after checking items", () => {
			const { component, getAllLines } = createMultiSelector(["A", "B", "C"]);

			component.handleInput(" "); // check A
			const text = getAllLines().join("\n");

			expect(text).toContain("(1 selected)");
		});

		test("updates count as more items are checked", () => {
			const { component, getAllLines } = createMultiSelector(["A", "B", "C"]);

			component.handleInput(" "); // check A
			component.handleInput("j");
			component.handleInput(" "); // check B

			const text = getAllLines().join("\n");
			expect(text).toContain("(2 selected)");
		});

		test("reverts to default help when all unchecked", () => {
			const { component, getAllLines } = createMultiSelector(["A", "B"]);

			component.handleInput(" "); // check
			component.handleInput(" "); // uncheck

			const text = getAllLines().join("\n");
			expect(text).toContain("up/down navigate");
			expect(text).not.toContain("selected)");
		});

		test("shows count for select-all", () => {
			const { component, getAllLines } = createMultiSelector(["A", "B", "C"]);

			component.handleInput("a");

			const text = getAllLines().join("\n");
			expect(text).toContain("(3 selected)");
		});
	});

	describe("navigation", () => {
		test("up/down moves cursor", () => {
			const { component, getOptionLines } = createMultiSelector(["A", "B", "C"]);

			expect(getOptionLines()[0]).toContain(theme.nav.cursor);

			component.handleInput("j"); // down
			expect(getOptionLines()[1]).toContain(theme.nav.cursor);
			expect(getOptionLines()[0]).not.toContain(theme.nav.cursor);

			component.handleInput("k"); // up
			expect(getOptionLines()[0]).toContain(theme.nav.cursor);
		});

		test("cursor does not move above first or below last", () => {
			const { component, getOptionLines } = createMultiSelector(["A", "B"]);

			component.handleInput("k"); // up from 0 — should stay at 0
			expect(getOptionLines()[0]).toContain(theme.nav.cursor);

			component.handleInput("j"); // to B
			component.handleInput("j"); // try past B
			expect(getOptionLines()[1]).toContain(theme.nav.cursor);
		});

		test("checked state persists when navigating away and back", () => {
			const { component, getOptionLines } = createMultiSelector(["A", "B", "C"]);

			component.handleInput(" "); // check A
			component.handleInput("j"); // move to B
			component.handleInput("j"); // move to C

			// A should still be checked
			expect(getOptionLines()[0]).toContain(theme.checkbox.checked);
		});
	});

	describe("single-select mode (multi: false)", () => {
		test("enter selects cursor item via onSelect", () => {
			const onSelect = vi.fn();
			const onCancel = vi.fn();
			const component = new HookSelectorComponent("Test", ["A", "B", "C"], onSelect, onCancel);

			component.handleInput("j"); // cursor on B
			component.handleInput("\n");

			expect(onSelect).toHaveBeenCalledWith("B");
		});

		test("does not show checkbox symbols", () => {
			const onSelect = vi.fn();
			const onCancel = vi.fn();
			const component = new HookSelectorComponent("Test", ["Alpha", "Beta"], onSelect, onCancel);
			const lines = component.render(RENDER_WIDTH).map(strip);

			for (const line of lines) {
				expect(line).not.toContain(theme.checkbox.checked);
				expect(line).not.toContain(theme.checkbox.unchecked);
			}
		});

		test("shows single-select help text", () => {
			const onSelect = vi.fn();
			const onCancel = vi.fn();
			const component = new HookSelectorComponent("Test", ["A"], onSelect, onCancel);
			const text = component.render(RENDER_WIDTH).map(strip).join("\n");

			expect(text).toContain("enter select");
			expect(text).not.toContain("space toggle");
		});
	});
});
