# Codex Computer Use Bridge Setup

## Architecture

```text
Preferred direct route:

Pi session
  → pi-mcp-adapter
  → bundled SkyComputerUseClient `mcp`
  → signed Sky/Codex Computer Use service
  → macOS Accessibility + ScreenCaptureKit
  → user-approved target application

Delegated comparison/fallback route:

Pi session
  → pi-mcp-adapter
  → codex-computer-use-mcp (Python stdio server)
  → codex app-server (private WebSocket protocol)
  → second Codex model turn
  → bundled Computer Use MCP
  → target application
```

The direct route removes both the Python bridge and second Codex model turn. Pi's current model reasons over the raw Computer Use tool results. The ChatGPT GUI is not a request hop; its installation supplies the signed plugin/helper and establishes permissions. OpenAI does not document external clients as a supported interface, so app updates can still change paths or behavior.

## Manual checklist

- [x] Install the current unified ChatGPT/Codex desktop release (`26.707.31428`, bundle `com.openai.codex`). The previous `1.2026.153` build is retained temporarily at `/Applications/ChatGPT.app.backup-1.2026.153`.
- [x] Confirm the bundled Computer Use plugin is installed and enabled; bridge status resolves it directly from the signed application bundle.
- [ ] Grant Accessibility and Screen & System Audio Recording only to the signed **Codex Computer Use** helper when macOS prompts.
- [ ] Approve only Calculator for the first test. Leave Locked Use disabled.
- [ ] In ChatGPT itself, successfully run: “Use @Computer to report the current Calculator display without changing it.”
- [ ] Restart Pi so it loads `pi-mcp-adapter` and this generated skill.
- [ ] In Pi, run `/codex-computer-use` with a read-only Calculator task and confirm status first.
- [ ] If status succeeds but execution requires app-access elicitation, temporarily change `CODEX_CU_APPROVAL_MODE` in `~/.config/mcp/mcp.json` from `never` to `known-safe-only`, supervise one Calculator test, then restore `never`.
- [ ] Never use approval mode `always`.

## Already completed

- [x] Installed `pi-mcp-adapter`.
- [x] Cloned bridge commit `5a838a56eb32ee5c824e7d0d12bb7c032fceacdc` to `~/.local/share/pi-bridges/codex-computer-use-mcp`.
- [x] Created a Python 3.13 virtual environment and installed the bridge.
- [x] Added the bundled `SkyComputerUseClient mcp` directly to `~/.config/mcp/mcp.json` as `codex-computer-use-direct`.
- [x] Verified direct MCP initialization and discovery of all ten raw Computer Use tools.
- [x] Retained the lazy delegated bridge configuration with approval mode `never` for comparison/fallback.
- [x] Verified delegated `codex_computer_use_status`: plugin installed, enabled, MCP server ready.
- [x] Completed a read-only bridge turn successfully; Codex reported the frontmost app without UI mutation.
- [x] Created the global Agent OS skill.

## Rollback

1. Remove the `codex-computer-use` entry from `~/.config/mcp/mcp.json`.
2. Run `pi remove npm:pi-mcp-adapter` if it is not used for anything else.
3. Delete `~/.local/share/pi-bridges/codex-computer-use-mcp`.
4. Revoke Codex Computer Use permissions in System Settings → Privacy & Security if the official feature is also no longer wanted.
