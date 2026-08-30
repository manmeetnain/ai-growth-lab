/**
 * Real-server worked example (build pipeline checklist item 8): wraps tools
 * from `@modelcontextprotocol/server-everything` — the official MCP
 * reference/test server maintained by the modelcontextprotocol.io team,
 * itself built on `@modelcontextprotocol/sdk@^1.30.0` (the exact legacy
 * generation Continuum targets, see RESEARCH.md) — behind `continuum()`,
 * and proves both the legacy and modern probes complete a full `tools/call`
 * round trip against it (see `everything.integration.test.ts`).
 *
 * `@modelcontextprotocol/server-everything`'s package.json declares no
 * "main"/"exports" field, only a "bin" entry — it ships purely as a CLI,
 * never designed to be imported as a library, so there is no stable module
 * path to import its `createServer()` from. Per CAPSTONE.md's pattern ("no
 * rewrite of the server's actual tool/resource logic"), this file
 * faithfully reproduces two of its real, unmodified tools instead — chosen
 * as the minimal subset needed to prove a full round trip on both specs —
 * copied verbatim (same name, schema, description, and handler body) from
 * the published package, version 2026.8.18:
 *   - src/tools/echo.ts    (registerEchoTool)
 *   - src/tools/get-sum.ts (registerGetSumTool)
 * Source: https://github.com/modelcontextprotocol/servers/tree/main/src/everything
 *
 * The remaining ~10 tools on the real server (tasks, sampling, elicitation,
 * resource subscriptions, gzip/image helpers, ...) are deliberately out of
 * scope here; broader multi-server/multi-tool coverage is the next
 * checklist item ("apply Continuum to 3-5 more real open-source servers").
 */
import { z } from "zod";
import { McpServer as LegacyMcpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpServer as ModernMcpServer } from "@modelcontextprotocol/server";

/** Verbatim from server-everything's src/tools/echo.ts (`EchoSchema`). */
const EchoSchema = z.object({
  message: z.string().describe("Message to echo"),
});

/** Verbatim from server-everything's src/tools/get-sum.ts (`GetSumSchema`). */
const GetSumSchema = z.object({
  a: z.number().describe("First number"),
  b: z.number().describe("Second number"),
});

/** Verbatim from server-everything's src/tools/echo.ts (`registerEchoTool`'s handler body). */
async function echoHandler(args: unknown) {
  const validatedArgs = EchoSchema.parse(args);
  return { content: [{ type: "text" as const, text: `Echo: ${validatedArgs.message}` }] };
}

/** Verbatim from server-everything's src/tools/get-sum.ts (`registerGetSumTool`'s handler body). */
async function getSumHandler(args: unknown) {
  const validatedArgs = GetSumSchema.parse(args);
  const sum = validatedArgs.a + validatedArgs.b;
  return {
    content: [{ type: "text" as const, text: `The sum of ${validatedArgs.a} and ${validatedArgs.b} is ${sum}.` }],
  };
}

/** Matches server-everything's own `createServer()` server info (name/version). */
export const EVERYTHING_SERVER_INFO = { name: "mcp-servers/everything", version: "2026.8.18" };

/**
 * Builds the legacy-generation (`@modelcontextprotocol/sdk@1.x`) server,
 * registering the same two real tools `createModernEverythingServer` does —
 * only the two-line server construction differs between generations (see
 * `continuum.ts` / the root README's note on why one factory per SDK
 * generation is required at the type level).
 */
export function createLegacyEverythingServer(): LegacyMcpServer {
  const server = new LegacyMcpServer(EVERYTHING_SERVER_INFO);
  server.registerTool(
    "echo",
    { title: "Echo Tool", description: "Echoes back the input string", inputSchema: EchoSchema },
    echoHandler,
  );
  server.registerTool(
    "get-sum",
    { title: "Get Sum Tool", description: "Returns the sum of two numbers", inputSchema: GetSumSchema },
    getSumHandler,
  );
  return server;
}

/** Builds the modern-generation (`@modelcontextprotocol/server@2.x`) server. See above. */
export function createModernEverythingServer(): ModernMcpServer {
  const server = new ModernMcpServer(EVERYTHING_SERVER_INFO);
  server.registerTool(
    "echo",
    { title: "Echo Tool", description: "Echoes back the input string", inputSchema: EchoSchema },
    echoHandler,
  );
  server.registerTool(
    "get-sum",
    { title: "Get Sum Tool", description: "Returns the sum of two numbers", inputSchema: GetSumSchema },
    getSumHandler,
  );
  return server;
}
