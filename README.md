# HydraDB OpenCode Plugin

Persistent, cross-session memory for [OpenCode](https://opencode.ai/docs/plugins/),
powered by [HydraDB](https://hydradb.com).

Unlike the MCP integration (pull-only tools the agent may call), this is a
native OpenCode **plugin**: it hooks the session lifecycle to **automatically**
recall relevant context at prompt time, sync workspace docs, and capture turns -
the same behavior as the Claude Code / Codex / Cursor plugins, on the same shared
engine (`scripts/plugin.mjs`).

## What it does

| OpenCode surface | Engine action |
|---|---|
| **`hydradb_recall` tool** (agent-invocable) | recall memory/knowledge for a query, returned to the agent |
| `event` -> `file.edited` | incremental workspace sync (`post-tool-use`) |
| `event` -> `session.idle` | capture the completed turn (`stop`) |
| `chat.message` + `experimental.chat.system.transform` | best-effort context injection (interactive TUI) |

Recall is delivered through the **`hydradb_recall` tool** the agent calls, which
is verified end to end in headless `opencode run`. The experimental
`system.transform` injection does NOT reach the model in headless mode, so the
tool is the reliable path.

Tool calls need approval: run with `--auto` (auto-approve) or approve
`hydradb_recall` interactively, e.g.:

```bash
opencode run --auto "What did we decide? Use hydradb_recall."
```

## Prerequisites

- [Bun](https://bun.sh) (OpenCode's runtime) and Node.js >= 18
- A HydraDB account: API key + tenant ID ([hydradb.com](https://hydradb.com))

## Install

The plugin file lives in `.opencode/plugins/`. For local use, place this repo so
OpenCode can load `.opencode/plugins/hydradb.js`; or publish it and reference it
in `opencode.json` (see `opencode.json.example`):

```json
{ "plugin": ["hydradb-opencode"] }
```

Set credentials (resolved by the shared engine, same as the other plugins):

```bash
export HYDRADB_API_KEY="your-api-key"
export HYDRADB_DATABASE="your-tenant-id"
```

## Configuration

Config keys, env overrides, and capture/search/ingest modes are identical to the
other HydraDB plugins - see `config.example.json`.

## MCP alternative

If you only want pull-style recall (agent-invoked tools), skip the plugin and add
the MCP server instead: `opencode mcp add hydradb --url https://mcp.hydradb.com`.
The plugin and MCP can be used together.

## License

Apache-2.0 - Copyright (c) 2026 HydraDB
