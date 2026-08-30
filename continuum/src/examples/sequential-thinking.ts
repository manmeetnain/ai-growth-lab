/**
 * Real-server worked example #2 (build pipeline checklist item 9): wraps
 * `@modelcontextprotocol/server-sequential-thinking` — an official
 * modelcontextprotocol.io reference server, itself built on
 * `@modelcontextprotocol/sdk@^1.29.0` (the exact legacy generation Continuum
 * targets, see RESEARCH.md) — behind `continuum()`.
 *
 * Unlike `everything.ts` (whose package ships no importable module, only a
 * `bin` entry), this package's `dist/lib.js` submodule is a clean,
 * side-effect-free library file: it exports only the `SequentialThinkingServer`
 * class, with no top-level code that starts a server or touches stdio. Its
 * `dist/index.js` CLI entry point, by contrast, calls `runServer().catch(...)`
 * unconditionally at module scope — importing it would immediately try to
 * connect a stdio transport — so this file imports `dist/lib.js` directly
 * instead (real, installed, unmodified code — not a reproduction; see
 * `third-party-servers.d.ts` for why a local ambient `.d.ts` is needed since
 * the package ships no types for that submodule) and registers the one real
 * tool itself, copied verbatim (name, schema shape, and handler body) from
 * `src/sequentialthinking/index.ts`, version 2026.7.4:
 *   https://github.com/modelcontextprotocol/servers/blob/main/src/sequentialthinking/index.ts
 * (The tool's long descriptive prose is abridged here to the parameters that
 * matter for a wire-level round trip; the schema and behavior are unchanged,
 * except that the real server's `coercedBoolean` schema helper — a
 * stdio-client compatibility shim that also accepts the strings `"true"`/
 * `"false"` for boolean fields — is dropped in favor of plain `z.boolean()`,
 * since both probes always send real JSON booleans over HTTP.)
 */
import { z } from "zod";
import { McpServer as LegacyMcpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpServer as ModernMcpServer } from "@modelcontextprotocol/server";
import { SequentialThinkingServer, type ThoughtData } from "@modelcontextprotocol/server-sequential-thinking/dist/lib.js";

/** Matches the real server's own server info (name/version) at the wrapped version. */
export const SEQUENTIAL_THINKING_SERVER_INFO = { name: "sequential-thinking-server", version: "2026.7.4" };

/** Verbatim from the real server's `index.ts` `inputSchema` (see file header for source). */
const SEQUENTIAL_THINKING_INPUT_SCHEMA = {
  thought: z.string().describe("Your current thinking step"),
  nextThoughtNeeded: z.boolean().describe("Whether another thought step is needed"),
  thoughtNumber: z.number().int().min(1).describe("Current thought number"),
  totalThoughts: z.number().int().min(1).describe("Estimated total thoughts needed"),
  isRevision: z.boolean().optional().describe("Whether this revises previous thinking"),
  revisesThought: z.number().int().min(1).optional().describe("Which thought is being reconsidered"),
  branchFromThought: z.number().int().min(1).optional().describe("Branching point thought number"),
  branchId: z.string().optional().describe("Branch identifier"),
  needsMoreThoughts: z.boolean().optional().describe("If more thoughts are needed"),
};

/** Verbatim from the real server's `index.ts` `outputSchema`. */
const SEQUENTIAL_THINKING_OUTPUT_SCHEMA = {
  thoughtNumber: z.number(),
  totalThoughts: z.number(),
  nextThoughtNeeded: z.boolean(),
  branches: z.array(z.string()),
  thoughtHistoryLength: z.number(),
};

/**
 * Builds one `[name, config, handler]` registration triple for the real
 * `sequentialthinking` tool, backed by a fresh `SequentialThinkingServer`
 * instance (the real, imported class — its in-memory thought history is
 * per-server-instance, exactly as in the original, so a legacy session and
 * a modern per-request server each get their own independent history,
 * matching the real server's own semantics). Handler body copied verbatim
 * from `index.ts`'s tool callback.
 *
 * Returned as a plain triple, rather than calling `server.registerTool(...)`
 * from inside a function typed to accept `LegacyMcpServer | ModernMcpServer`,
 * because TypeScript cannot resolve an overloaded method call through a
 * union of the two distinct SDK generations' classes (see `continuum.ts`'s
 * note on why one factory per generation exists at all) — each factory
 * below instead calls `registerTool` itself, against its own concretely
 * typed `server`, so this triple is defined once and the two call sites
 * stay the only duplication.
 */
function sequentialThinkingToolRegistration() {
  const thinkingServer = new SequentialThinkingServer();
  return {
    name: "sequentialthinking" as const,
    config: {
      title: "Sequential Thinking",
      description:
        "A detailed tool for dynamic and reflective problem-solving through thoughts. " +
        "Each thought can build on, question, or revise previous insights as understanding deepens.",
      inputSchema: SEQUENTIAL_THINKING_INPUT_SCHEMA,
      outputSchema: SEQUENTIAL_THINKING_OUTPUT_SCHEMA,
    },
    handler: async (args: ThoughtData) => {
      const result = thinkingServer.processThought(args);
      if (result.isError) {
        return result;
      }
      const parsedContent = JSON.parse(result.content[0].text);
      return { content: result.content, structuredContent: parsedContent };
    },
  };
}

/** Builds the legacy-generation server. See `everything.ts` for why one factory per SDK generation is required. */
export function createLegacySequentialThinkingServer(): LegacyMcpServer {
  const server = new LegacyMcpServer(SEQUENTIAL_THINKING_SERVER_INFO);
  const { name, config, handler } = sequentialThinkingToolRegistration();
  server.registerTool(name, config, handler);
  return server;
}

/** Builds the modern-generation server. See above. */
export function createModernSequentialThinkingServer(): ModernMcpServer {
  const server = new ModernMcpServer(SEQUENTIAL_THINKING_SERVER_INFO);
  const { name, config, handler } = sequentialThinkingToolRegistration();
  server.registerTool(name, config, handler);
  return server;
}
