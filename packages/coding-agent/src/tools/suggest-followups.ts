import type { AgentTool, AgentToolContext, AgentToolResult, AgentToolUpdateCallback } from "@oh-my-pi/pi-agent-core";
import type { Component } from "@oh-my-pi/pi-tui";
import { Text } from "@oh-my-pi/pi-tui";
import { type Static, Type } from "@sinclair/typebox";
import { renderPromptTemplate } from "../config/prompt-templates";
import type { RenderResultOptions } from "../extensibility/custom-tools/types";
import type { Theme } from "../modes/theme/theme";
import suggestFollowupsDescription from "../prompts/tools/suggest-followups.md" with { type: "text" };
import { renderStatusLine } from "../tui";
import type { ToolSession } from ".";

import { formatTitle } from "./render-utils";

const suggestFollowupsSchema = Type.Object({
	followups: Type.Array(
		Type.Object({
			prompt: Type.String({ description: "Full prompt text to send as next user message" }),
			label: Type.Optional(Type.String({ description: "Short display label (defaults to truncated prompt)" })),
			priority: Type.Optional(
				Type.Union([Type.Literal("must-have"), Type.Literal("nice-to-have"), Type.Literal("optional")], {
					description:
						"Priority level. 'must-have' for critical follow-ups, 'nice-to-have' for recommended, 'optional' for low priority. Defaults to 'nice-to-have'.",
				}),
			),
		}),
		{ minItems: 1, description: "Suggested followup actions" },
	),
});

type SuggestFollowupsParams = Static<typeof suggestFollowupsSchema>;

export interface SuggestFollowupsDetails {
	followups: Array<{ prompt: string; label?: string; priority?: "must-have" | "nice-to-have" | "optional" }>;
}

export class SuggestFollowupsTool implements AgentTool<typeof suggestFollowupsSchema, SuggestFollowupsDetails> {
	readonly name = "suggest_followups";
	readonly label = "SuggestFollowups";
	readonly description: string;
	readonly parameters = suggestFollowupsSchema;
	readonly strict = true;

	constructor(readonly _session: ToolSession) {
		this.description = renderPromptTemplate(suggestFollowupsDescription);
	}

	async execute(
		_toolCallId: string,
		params: SuggestFollowupsParams,
		_signal?: AbortSignal,
		_onUpdate?: AgentToolUpdateCallback<SuggestFollowupsDetails>,
		_context?: AgentToolContext,
	): Promise<AgentToolResult<SuggestFollowupsDetails>> {
		return {
			content: [{ type: "text", text: "Suggested followup actions shown to user." }],
			details: { followups: params.followups },
		};
	}
}

// =============================================================================
// TUI Renderer
// =============================================================================

interface SuggestFollowupsRenderArgs {
	followups?: Array<{ prompt?: string; label?: string; priority?: string }>;
}

export const suggestFollowupsToolRenderer = {
	inline: true,

	renderCall(args: SuggestFollowupsRenderArgs, _options: RenderResultOptions, uiTheme: Theme): Component {
		const label = formatTitle("Followups", uiTheme);

		if (!args.followups || args.followups.length === 0) {
			return new Text(`${label} ${uiTheme.fg("muted", "No suggestions")}`, 0, 0);
		}

		let text = `${label} ${uiTheme.fg("muted", `${args.followups.length} suggestions`)}`;
		for (const followup of args.followups) {
			const displayLabel = followup.label || (followup.prompt?.slice(0, 80) ?? "");
			text += `\n ${uiTheme.fg("dim", "\u2192")} ${uiTheme.fg("accent", displayLabel)}`;
		}

		return new Text(text, 0, 0);
	},

	renderResult(
		result: { content: Array<{ type: string; text?: string }>; details?: SuggestFollowupsDetails },
		_options: RenderResultOptions,
		uiTheme: Theme,
	): Component {
		const count = result.details?.followups?.length ?? 0;
		const header = renderStatusLine(
			{ icon: "success", title: "Followups", meta: [`${count} suggestion${count !== 1 ? "s" : ""}`] },
			uiTheme,
		);
		return new Text(header, 0, 0);
	},
};
