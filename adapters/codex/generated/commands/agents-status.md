<!-- Generated from Agent OS src by scripts/agents-os.mjs. Do not edit directly. -->

Summarize recent agent activity.

## Instructions

1. Read the agent event log at `~/.agents-os/runtime/logs/agents.jsonl`
   - If the file doesn't exist or is empty, report "No agent activity logged yet."

2. Parse the JSONL entries. Each line is a JSON object with:
   - `ts`: ISO timestamp
   - `event`: "start" or "stop"
   - `agent_id`: unique agent identifier
   - `agent_type`: e.g., "builder", "validator", "Explore", etc.
   - `summary`: (stop events only) truncated last message

3. Summarize:
   - Total agents started and completed
   - Breakdown by agent type
   - Any agents that started but haven't stopped (potentially still running)
   - Most recent 5 events with timestamps

Keep the output concise — this is a quick status check, not a deep analysis.
