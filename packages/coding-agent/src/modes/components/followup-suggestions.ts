/**
 * Inline followup suggestions component.
 * Renders numbered suggestions at the bottom of the chat after agent completes.
 * Supports multi-select: space/number to toggle, arrow keys to navigate, enter to confirm.
 */
import { Container, Spacer, Text } from "@oh-my-pi/pi-tui";
import { theme } from "../theme/theme";

export interface FollowupSuggestion {
	prompt: string;
	label?: string;
	priority?: "must-have" | "nice-to-have" | "optional";
}

export class FollowupSuggestionsComponent extends Container {
	#suggestions: FollowupSuggestion[];
	#onConfirm: (indices: number[]) => void;
	#focusedIndex = -1;
	#checked = new Set<number>();
	#itemTexts: Text[] = [];
	#hintText: Text | undefined;

	constructor(suggestions: FollowupSuggestion[], onConfirm: (indices: number[]) => void) {
		super();
		this.#suggestions = suggestions;
		this.#onConfirm = onConfirm;
		this.#buildContent();
	}

	get suggestions(): FollowupSuggestion[] {
		return this.#suggestions;
	}

	get focusedIndex(): number {
		return this.#focusedIndex;
	}

	get checkedIndices(): number[] {
		return Array.from(this.#checked).sort((a, b) => a - b);
	}

	/** Toggle checked state of an item. Also focuses it. */
	toggle(index: number): void {
		if (index < 0 || index >= this.#suggestions.length) return;
		if (this.#checked.has(index)) {
			this.#checked.delete(index);
		} else {
			this.#checked.add(index);
		}
		this.#setFocused(index);
		this.#updateHint();
	}

	/** Move cursor up. Returns true if handled. */
	moveUp(): boolean {
		if (this.#suggestions.length === 0) return false;
		if (this.#focusedIndex <= 0) {
			this.#setFocused(this.#suggestions.length - 1);
		} else {
			this.#setFocused(this.#focusedIndex - 1);
		}
		return true;
	}

	/** Move cursor down. Returns true if handled. */
	moveDown(): boolean {
		if (this.#suggestions.length === 0) return false;
		if (this.#focusedIndex < 0 || this.#focusedIndex >= this.#suggestions.length - 1) {
			this.#setFocused(0);
		} else {
			this.#setFocused(this.#focusedIndex + 1);
		}
		return true;
	}

	/** Confirm selection. If items are checked, submit those. Otherwise submit focused item. Returns true if handled. */
	confirmSelection(): boolean {
		if (this.#checked.size > 0) {
			this.#onConfirm(this.checkedIndices);
			return true;
		}
		if (this.#focusedIndex >= 0 && this.#focusedIndex < this.#suggestions.length) {
			this.#onConfirm([this.#focusedIndex]);
			return true;
		}
		return false;
	}

	#setFocused(index: number): void {
		const prev = this.#focusedIndex;
		this.#focusedIndex = index;
		if (prev >= 0 && prev < this.#itemTexts.length) {
			this.#itemTexts[prev].setText(this.#formatItem(prev, false));
		}
		if (index >= 0 && index < this.#itemTexts.length) {
			this.#itemTexts[index].setText(this.#formatItem(index, true));
		}
		this.invalidate();
	}

	#updateHint(): void {
		if (!this.#hintText) return;
		const count = this.#checked.size;
		const numHint = this.#suggestions.length <= 9 ? "number/" : "";
		if (count > 0) {
			this.#hintText.setText(
				theme.fg("dim", `(${count} selected) ${numHint}space toggle, \u2191\u2193 navigate, enter confirm`),
			);
		} else {
			this.#hintText.setText(theme.fg("dim", `(${numHint}space toggle, \u2191\u2193 navigate, enter confirm)`));
		}
		this.invalidate();
	}

	#formatItem(i: number, focused: boolean): string {
		const suggestion = this.#suggestions[i];
		const displayLabel = suggestion.label || suggestion.prompt.slice(0, 100);
		const num = i < 9 ? theme.fg("accent", `${i + 1}`) : theme.fg("dim", `${i + 1}`);
		const isChecked = this.#checked.has(i);
		const checkbox = isChecked ? theme.checkbox.checked : theme.checkbox.unchecked;
		const checkboxStr = isChecked ? theme.fg("success", checkbox) : theme.fg("dim", checkbox);
		const priorityTag =
			suggestion.priority === "must-have"
				? theme.fg("warning", " [must-have]")
				: suggestion.priority === "optional"
					? theme.fg("dim", " [optional]")
					: "";
		if (focused) {
			const label = isChecked ? theme.fg("accent", displayLabel) : theme.fg("accent", displayLabel);
			return ` ${theme.fg("accent", theme.nav.cursor)} ${checkboxStr} ${num} ${label}${priorityTag}`;
		}
		return `   ${checkboxStr} ${num} ${theme.fg("dim", "\u2192")} ${theme.fg("text", displayLabel)}${priorityTag}`;
	}

	#buildContent(): void {
		this.clear();
		this.#itemTexts = [];
		this.addChild(new Spacer(1));

		const numHint = this.#suggestions.length <= 9 ? "number/" : "";
		this.#hintText = new Text(
			theme.fg("muted", "Suggested next steps ") +
				theme.fg("dim", `(${numHint}space toggle, \u2191\u2193 navigate, enter confirm)`),
			1,
			0,
		);
		this.addChild(this.#hintText);

		for (let i = 0; i < this.#suggestions.length; i++) {
			const text = new Text(this.#formatItem(i, false), 1, 0);
			this.#itemTexts.push(text);
			this.addChild(text);
		}
	}
}
