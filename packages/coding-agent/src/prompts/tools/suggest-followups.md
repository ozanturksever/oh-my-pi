Suggest followup actions after completing work.

Call this tool at the end of each turn, after all other work is done. Suggest ~3 contextual next steps the user might want to take based on what was just accomplished.

Guidelines:
- Each followup must have a `prompt` field containing the full text to send as the next user message
- Optionally include a short `label` for compact display (defaults to truncated prompt)
- Focus on actionable code tasks directly related to the completed work
- Be specific to the codebase and recent changes, not generic
- Do NOT suggest: committing, pushing, manual testing, reviewing code, or running formatters
- Good suggestions: adding tests for new code, handling edge cases, refactoring related code, extending functionality, fixing related TODOs
- Optionally include `priority`: "must-have" for critical items (tests missing, broken imports, unfinished work), "nice-to-have" for recommended improvements, "optional" for polish. Defaults to "nice-to-have".