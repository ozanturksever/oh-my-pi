/**
 * Generic selector component for hooks.
 * Displays a list of string options with keyboard navigation.
 */
import { Container, matchesKey, padding, Spacer, Text, type TUI, visibleWidth } from "@oh-my-pi/pi-tui";
import { theme } from "../../modes/theme/theme";
import { CountdownTimer } from "./countdown-timer";
import { DynamicBorder } from "./dynamic-border";

export interface HookSelectorOptions {
	tui?: TUI;
	timeout?: number;
	initialIndex?: number;
	outline?: boolean;
	maxVisible?: number;
	multi?: boolean;
}

class OutlinedList extends Container {
	#lines: string[] = [];

	setLines(lines: string[]): void {
		this.#lines = lines;
		this.invalidate();
	}

	render(width: number): string[] {
		const borderColor = (text: string) => theme.fg("border", text);
		const horizontal = borderColor(theme.boxSharp.horizontal.repeat(Math.max(1, width)));
		const innerWidth = Math.max(1, width - 2);
		const content = this.#lines.map(line => {
			const pad = Math.max(0, innerWidth - visibleWidth(line));
			return `${borderColor(theme.boxSharp.vertical)}${line}${padding(pad)}${borderColor(theme.boxSharp.vertical)}`;
		});
		return [horizontal, ...content, horizontal];
	}
}

export class HookSelectorComponent extends Container {
	#options: string[];
	#selectedIndex: number;
	#maxVisible: number;
	#listContainer: Container | undefined;
	#outlinedList: OutlinedList | undefined;
	#onSelectCallback: (option: string) => void;
	#onMultiSelectCallback: ((options: string[]) => void) | undefined;
	#onCancelCallback: () => void;
	#titleText: Text;
	#baseTitle: string;
	#countdown: CountdownTimer | undefined;
	#multi: boolean;
	#checked = new Set<number>();
	#helpText: Text;

	constructor(
		title: string,
		options: string[],
		onSelect: (option: string) => void,
		onCancel: () => void,
		opts?: HookSelectorOptions,
	) {
		super();

		this.#options = options;
		this.#selectedIndex = Math.min(opts?.initialIndex ?? 0, options.length - 1);
		this.#maxVisible = Math.max(3, opts?.maxVisible ?? 12);
		this.#onSelectCallback = onSelect;
		this.#onCancelCallback = onCancel;
		this.#baseTitle = title;
		this.#multi = opts?.multi ?? false;

		this.addChild(new DynamicBorder());
		this.addChild(new Spacer(1));

		this.#titleText = new Text(theme.fg("accent", title), 1, 0);
		this.addChild(this.#titleText);
		this.addChild(new Spacer(1));

		if (opts?.timeout && opts.timeout > 0 && opts.tui) {
			this.#countdown = new CountdownTimer(
				opts.timeout,
				opts.tui,
				s => this.#titleText.setText(theme.fg("accent", `${this.#baseTitle} (${s}s)`)),
				() => {
					// Auto-select current option on timeout (typically the first/recommended option)
					const selected = this.#options[this.#selectedIndex];
					if (selected) {
						this.#onSelectCallback(selected);
					} else {
						this.#onCancelCallback();
					}
				},
			);
		}

		if (opts?.outline) {
			this.#outlinedList = new OutlinedList();
			this.addChild(this.#outlinedList);
		} else {
			this.#listContainer = new Container();
			this.addChild(this.#listContainer);
		}
		this.addChild(new Spacer(1));
		const helpMsg = this.#multi
			? "up/down navigate  space toggle  a all  enter confirm  esc cancel"
			: "up/down navigate  enter select  esc cancel";
		this.#helpText = new Text(theme.fg("dim", helpMsg), 1, 0);
		this.addChild(this.#helpText);
		this.addChild(new Spacer(1));
		this.addChild(new DynamicBorder());

		this.#updateList();
	}

	setOnMultiSelect(cb: (options: string[]) => void): void {
		this.#onMultiSelectCallback = cb;
	}

	#updateList(): void {
		const lines: string[] = [];
		const startIndex = Math.max(
			0,
			Math.min(this.#selectedIndex - Math.floor(this.#maxVisible / 2), this.#options.length - this.#maxVisible),
		);
		const endIndex = Math.min(startIndex + this.#maxVisible, this.#options.length);

		for (let i = startIndex; i < endIndex; i++) {
			const isAtCursor = i === this.#selectedIndex;
			let text: string;
			if (this.#multi) {
				const isChecked = this.#checked.has(i);
				const checkbox = isChecked ? theme.checkbox.checked : theme.checkbox.unchecked;
				const checkboxStr = isChecked ? theme.fg("success", checkbox) : theme.fg("dim", checkbox);
				text = isAtCursor
					? theme.fg("accent", `${theme.nav.cursor} `) + checkboxStr + theme.fg("accent", ` ${this.#options[i]}`)
					: `  ${checkboxStr} ${theme.fg("text", this.#options[i])}`;
			} else {
				text = isAtCursor
					? theme.fg("accent", `${theme.nav.cursor} `) + theme.fg("accent", this.#options[i])
					: `  ${theme.fg("text", this.#options[i])}`;
			}
			lines.push(text);
		}

		if (startIndex > 0 || endIndex < this.#options.length) {
			lines.push(theme.fg("dim", `  (${this.#selectedIndex + 1}/${this.#options.length})`));
		}
		if (this.#outlinedList) {
			this.#outlinedList.setLines(lines);
			return;
		}
		this.#listContainer?.clear();
		for (const line of lines) {
			this.#listContainer?.addChild(new Text(line, 1, 0));
		}

		if (this.#multi) {
			const count = this.#checked.size;
			const helpMsg =
				count > 0
					? `(${count} selected) enter confirm  space toggle  a all  esc cancel`
					: "up/down navigate  space toggle  a all  enter confirm  esc cancel";
			this.#helpText.setText(theme.fg("dim", helpMsg));
		}
	}

	handleInput(keyData: string): void {
		// Reset countdown on any interaction
		this.#countdown?.reset();

		if (matchesKey(keyData, "up") || keyData === "k") {
			this.#selectedIndex = Math.max(0, this.#selectedIndex - 1);
			this.#updateList();
		} else if (matchesKey(keyData, "down") || keyData === "j") {
			this.#selectedIndex = Math.min(this.#options.length - 1, this.#selectedIndex + 1);
			this.#updateList();
		} else if (matchesKey(keyData, "enter") || matchesKey(keyData, "return") || keyData === "\n") {
			if (this.#multi) {
				const indices = this.#checked.size > 0 ? Array.from(this.#checked) : [this.#selectedIndex];
				const selected = indices
					.sort((a, b) => a - b)
					.map(i => this.#options[i])
					.filter(Boolean);
				if (selected.length > 0) {
					if (this.#onMultiSelectCallback) {
						this.#onMultiSelectCallback(selected);
					} else {
						this.#onSelectCallback(selected[0]);
					}
				}
			} else {
				const selected = this.#options[this.#selectedIndex];
				if (selected) this.#onSelectCallback(selected);
			}
		} else if (this.#multi && keyData === " ") {
			if (this.#checked.has(this.#selectedIndex)) {
				this.#checked.delete(this.#selectedIndex);
			} else {
				this.#checked.add(this.#selectedIndex);
			}
			this.#updateList();
		} else if (this.#multi && keyData === "a") {
			if (this.#checked.size === this.#options.length) {
				this.#checked.clear();
			} else {
				for (let i = 0; i < this.#options.length; i++) {
					this.#checked.add(i);
				}
			}
			this.#updateList();
		} else if (matchesKey(keyData, "escape") || matchesKey(keyData, "esc") || matchesKey(keyData, "ctrl+c")) {
			this.#onCancelCallback();
		}
	}

	dispose(): void {
		this.#countdown?.dispose();
	}
}
