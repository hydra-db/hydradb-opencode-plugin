import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { tool } from "@opencode-ai/plugin"

/** Repo root resolved from this plugin file (.opencode/plugins/ -> ../../). */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const RUNNER = path.join(ROOT, "scripts", "run-plugin.sh")

/**
 * Invoke the shared HydraDB engine and return its stdout.
 * @param {string} subcommand engine subcommand (user-prompt-submit, post-tool-use, stop, ...)
 * @param {string} [stdin] hook JSON piped to the engine
 */
function runEngine(subcommand, stdin) {
  const res = spawnSync("bash", [RUNNER, subcommand], {
    input: stdin ?? "",
    encoding: "utf8",
    timeout: 30000,
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: ROOT },
  })
  return res.stdout ?? ""
}

/** Extract the injected context string from an engine hook payload. */
function parseContext(out) {
  for (const line of out.trim().split("\n")) {
    try {
      const parsed = JSON.parse(line)
      const ctx = parsed?.hookSpecificOutput?.additionalContext ?? parsed?.additional_context
      if (ctx) return ctx
    } catch {
      /* non-JSON engine line */
    }
  }
  return ""
}

/**
 * HydraDB memory for OpenCode: prompt-time recall injected into the system
 * prompt, plus automatic workspace sync and turn capture over the same shared
 * engine used by the Claude Code / Codex / Cursor plugins.
 */
export const HydraDB = async () => {
  /**
   * Recalled context awaiting injection. Keyed single value, not a per-session
   * map: system.transform's sessionID is optional and often undefined, so it
   * cannot reliably match the chat.message key. A turn recalls then immediately
   * injects, so last-write-wins is correct for the active turn.
   */
  let pending = ""

  return {
    // Agent-invocable recall tool. More reliable than experimental context
    // injection, which does not reach the model in headless `opencode run`.
    tool: {
      hydradb_recall: tool({
        description:
          "Recall relevant long-term memory and knowledge from HydraDB for a query. " +
          "Use before answering anything that may depend on prior conversations, decisions, or stored docs.",
        args: { query: tool.schema.string().describe("What to recall from HydraDB") },
        async execute({ query }) {
          const ctx = parseContext(
            runEngine("user-prompt-submit", JSON.stringify({ session_id: "tool", prompt: query }))
          )
          return ctx || "No relevant HydraDB context found."
        },
      }),
    },

    event: async ({ event }) => {
      if (event?.type === "file.edited") {
        const file = event.properties?.file ?? event.properties?.path
        runEngine("post-tool-use", JSON.stringify({ tool_input: { file_path: file } }))
      } else if (event?.type === "session.idle") {
        runEngine("stop", JSON.stringify({ session_id: event.properties?.sessionID ?? "" }))
      }
    },

    "chat.message": async (input, output) => {
      const sessionID = input?.sessionID ?? output?.message?.sessionID ?? ""
      const prompt = (output?.parts ?? [])
        .map((p) => p?.text ?? "")
        .join(" ")
        .trim()
      if (!prompt) return
      const ctx = parseContext(runEngine("user-prompt-submit", JSON.stringify({ session_id: sessionID, prompt })))
      if (ctx) pending = ctx
    },

    "experimental.chat.system.transform": async (_input, output) => {
      if (pending) {
        output.system.push(pending)
        pending = ""
      }
    },
  }
}
