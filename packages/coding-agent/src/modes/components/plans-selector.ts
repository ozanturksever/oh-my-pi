import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
	type Component,
	Container,
	Input,
	matchesKey,
	padding,
	Spacer,
	Text,
	truncateToWidth,
	visibleWidth,
} from "@oh-my-pi/pi-tui";
import { isEnoent } from "@oh-my-pi/pi-utils";
import { theme } from "../../modes/theme/theme";
import { fuzzyFilter } from "../../utils/fuzzy";
import { DynamicBorder } from "./dynamic-border";

export interface PlanInfo {
	id: string;
	title: string;
	summary: string;
	modified: Date;
	path: string;
}

export async function loadPlans(plansDir: string, limit = 5): Promise<PlanInfo[]> {
	let entries: string[];
	try {
		entries = await fs.readdir(plansDir);
	} catch (err) {
		if (isEnoent(err)) return [];
		throw err;
	}

	const plans: PlanInfo[] = [];

	for (const entry of entries) {
		const dirPath = path.join(plansDir, entry);
		try {
			const dirStat = await fs.stat(dirPath);
			if (!dirStat.isDirectory()) continue;
		} catch {
			continue;
		}

		const planPath = path.join(dirPath, "plan.md");
		let title = entry;
		let summary = "";
		let mtime: Date;

		try {
			const [fileStat, content] = await Promise.all([fs.stat(planPath), Bun.file(planPath).text()]);
			mtime = fileStat.mtime;
			const lines = content.split("\n", 5);

			// Extract title from first heading
			for (const line of lines) {
				const trimmed = line.trim();
				if (trimmed.startsWith("# Plan: ")) {
					title = trimmed.slice("# Plan: ".length).trim();
					break;
				}
				if (trimmed.startsWith("# ")) {
					title = trimmed.slice(2).trim();
					break;
				}
			}

			// Extract summary: first non-empty, non-heading line after the title line
			let pastTitle = false;
			for (const line of lines) {
				const trimmed = line.trim();
				if (!pastTitle) {
					if (trimmed.startsWith("#")) {
						pastTitle = true;
					}
					continue;
				}
				if (trimmed && !trimmed.startsWith("#")) {
					summary = trimmed;
					break;
				}
			}
		} catch (err) {
			if (isEnoent(err)) continue;
			// Malformed content — use defaults with current time
			mtime = new Date();
		}

		plans.push({
			id: entry,
			title,
			summary,
			modified: mtime,
			path: planPath,
		});
	}

	plans.sort((a, b) => b.modified.getTime() - a.modified.getTime());
	return plans.slice(0, limit);
}

class PlanList implements Component {
	#filteredPlans: PlanInfo[] = [];
	#selectedIndex = 0;
	readonly #searchInput: Input;
	onSelect?: (plan: PlanInfo) => void;
	onEdit?: (plan: PlanInfo) => void;
	onCancel?: () => void;
	onExit: () => void = () => {};
	#maxVisible = 5;

	constructor(private readonly allPlans: PlanInfo[]) {
		this.#filteredPlans = allPlans;
		this.#searchInput = new Input();

		this.#searchInput.onSubmit = () => {
			const selected = this.#filteredPlans[this.#selectedIndex];
			if (selected && this.onSelect) {
				this.onSelect(selected);
			}
		};
	}

	#filterPlans(query: string): void {
		this.#filteredPlans = fuzzyFilter(this.allPlans, query, plan => {
			return [plan.id, plan.title, plan.summary].filter(Boolean).join(" ");
		});
		this.#selectedIndex = Math.min(this.#selectedIndex, Math.max(0, this.#filteredPlans.length - 1));
	}

	invalidate(): void {}

	render(width: number): string[] {
		const lines: string[] = [];

		lines.push(...this.#searchInput.render(width));
		lines.push("");

		if (this.#filteredPlans.length === 0) {
			lines.push(truncateToWidth(theme.fg("muted", "  No plans found"), width));
			return lines;
		}

		const formatDate = (date: Date): string => {
			const now = new Date();
			const diffMs = now.getTime() - date.getTime();
			const diffMins = Math.floor(diffMs / 60000);
			const diffHours = Math.floor(diffMs / 3600000);
			const diffDays = Math.floor(diffMs / 86400000);

			if (diffMins < 1) return "just now";
			if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? "s" : ""} ago`;
			if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
			if (diffDays === 1) return "1 day ago";
			if (diffDays < 7) return `${diffDays} days ago`;
			return date.toLocaleDateString();
		};

		const startIndex = Math.max(
			0,
			Math.min(
				this.#selectedIndex - Math.floor(this.#maxVisible / 2),
				this.#filteredPlans.length - this.#maxVisible,
			),
		);
		const endIndex = Math.min(startIndex + this.#maxVisible, this.#filteredPlans.length);

		for (let i = startIndex; i < endIndex; i++) {
			const plan = this.#filteredPlans[i];
			const isSelected = i === this.#selectedIndex;

			const cursorSymbol = `${theme.nav.cursor} `;
			const cursorWidth = visibleWidth(cursorSymbol);
			const cursor = isSelected ? theme.fg("accent", cursorSymbol) : padding(cursorWidth);
			const maxWidth = width - cursorWidth;

			// Title line
			const truncatedTitle = truncateToWidth(plan.title, maxWidth);
			const titleLine = cursor + (isSelected ? theme.bold(truncatedTitle) : truncatedTitle);
			lines.push(titleLine);

			// Summary line (dimmed)
			if (plan.summary) {
				const truncatedSummary = truncateToWidth(plan.summary, maxWidth);
				lines.push(`  ${theme.fg("dim", truncatedSummary)}`);
			}

			// Date line (dimmed)
			const dateLine = `  ${formatDate(plan.modified)}`;
			lines.push(theme.fg("dim", truncateToWidth(dateLine, width)));

			lines.push(""); // Blank separator
		}

		if (startIndex > 0 || endIndex < this.#filteredPlans.length) {
			const scrollText = `  (${this.#selectedIndex + 1}/${this.#filteredPlans.length})`;
			lines.push(theme.fg("muted", truncateToWidth(scrollText, width)));
		}
		// Hint line
		lines.push(theme.fg("muted", truncateToWidth("  Enter: load  Ctrl+E: open in editor  Esc: cancel", width)));
		return lines;
	}

	handleInput(keyData: string): void {
		if (matchesKey(keyData, "up")) {
			this.#selectedIndex = Math.max(0, this.#selectedIndex - 1);
		} else if (matchesKey(keyData, "down")) {
			this.#selectedIndex = Math.min(this.#filteredPlans.length - 1, this.#selectedIndex + 1);
		} else if (matchesKey(keyData, "pageUp")) {
			this.#selectedIndex = Math.max(0, this.#selectedIndex - this.#maxVisible);
		} else if (matchesKey(keyData, "pageDown")) {
			this.#selectedIndex = Math.min(this.#filteredPlans.length - 1, this.#selectedIndex + this.#maxVisible);
		} else if (matchesKey(keyData, "enter") || matchesKey(keyData, "return") || keyData === "\n") {
			const selected = this.#filteredPlans[this.#selectedIndex];
			if (selected && this.onSelect) {
				this.onSelect(selected);
			}
		} else if (matchesKey(keyData, "ctrl+e")) {
			const selected = this.#filteredPlans[this.#selectedIndex];
			if (selected && this.onEdit) {
				this.onEdit(selected);
			}
		} else if (matchesKey(keyData, "escape") || matchesKey(keyData, "esc")) {
			if (this.onCancel) {
				this.onCancel();
			}
		} else if (matchesKey(keyData, "ctrl+c")) {
			this.onExit();
		} else {
			this.#searchInput.handleInput(keyData);
			this.#filterPlans(this.#searchInput.getValue());
		}
	}
}

export class PlansSelectorComponent extends Container {
	#planList: PlanList;

	constructor(
		plans: PlanInfo[],
		onSelect: (plan: PlanInfo) => void,
		onEdit: (plan: PlanInfo) => void,
		onCancel: () => void,
		onExit: () => void,
	) {
		super();

		this.addChild(new Spacer(1));
		this.addChild(new Text(theme.bold("Plans"), 1, 0));
		this.addChild(new Spacer(1));
		this.addChild(new DynamicBorder());
		this.addChild(new Spacer(1));

		this.#planList = new PlanList(plans);
		this.#planList.onSelect = onSelect;
		this.#planList.onEdit = onEdit;
		this.#planList.onCancel = onCancel;
		this.#planList.onExit = onExit;

		this.addChild(this.#planList);

		this.addChild(new Spacer(1));
		this.addChild(new DynamicBorder());
	}

	getPlanList(): PlanList {
		return this.#planList;
	}
}
