---
name: pi-hop
description: "Use the local Pi /hop workflow to move or clone work into a related Pi chat in a new tmux window. Trigger when the user asks to hop, hand off to a new chat/thread, move this to another Pi session, clone the current thread, or start a fresh summarized continuation."
user_invocable: true
---

# Pi Hop Workflow

Use the local `/hop` command when the user wants to continue work in another Pi chat/window.

## When to use

Trigger when the user asks to:

- hop to a new chat/thread/window
- hand off current work to a fresh Pi chat
- move this task/context to another Pi session
- clone the current thread
- start a clean continuation from the current conversation

## Commands

There is only one slash command:

```txt
/hop
```

Do not invent or use `/handoff`. `/hop fork` is not available in V1.

## Agent-origin rule

When an agent invokes or recommends Hop, always include `--agent`.

Agent-origin Hop always requires explicit user confirmation before generating a handoff, creating a session, artifact, or tmux window.

## Fresh summarized transfer

For a fresh summarized continuation, use:

```txt
/hop handoff --agent <goal for the next thread>
```

This generates a source-window draft, lets the user review/edit it, then opens a new tmux window only after the user accepts the draft.

## Same-context continuation

For same-context continuation, use:

```txt
/hop clone --agent [instruction]
```

This clones the current Pi thread into a distinct Pi session file and opens it in a new tmux window. If an instruction is provided, it is prefilled in the destination editor.

## Constraints

- Hop requires tmux.
- Hop never creates tmux sessions; it only opens a new window in the current tmux session.
- Hop should not use manual copy/paste handoffs when available.
- Hop does not preserve model/thinking/tool flags in V1.
- Hop uses prefill artifacts, not clipboard.
- Source thread should remain untouched.
