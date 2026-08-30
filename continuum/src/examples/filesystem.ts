/**
 * Real-server worked example #3 (build pipeline checklist item 9): wraps two
 * tools from `@modelcontextprotocol/server-filesystem` — an official
 * modelcontextprotocol.io reference server, itself built on
 * `@modelcontextprotocol/sdk@^1.29.0` (the exact legacy generation Continuum
 * targets, see RESEARCH.md) — behind `continuum()`.
 *
 * Like `sequential-thinking.ts` (and unlike `everything.ts`), this package
 * ships clean, side-effect-free library submodules under `dist/`:
 * `validatePath`, `readFileContent`, `tailFile`, `headFile`, and
 * `setAllowedDirectories` are all imported here as real, installed,
 * unmodified code from `dist/lib.js` (see `third-party-servers.d.ts` for the
 * local ambient types this package doesn't ship). `dist/index.js`, its CLI
 * entry point, is not imported — it runs top-level `await`-based argv
 * parsing unconditionally at module scope (including a `process.exit(1)` if
 * no directory argument is accessible), so it can't safely be imported as a
 * library at all.
 *
 * `validatePath` is exactly the real server's directory-confinement and
 * symlink-attack defense (resolves the real path via `fs.realpath` and
 * rejects anything outside the directories passed to
 * `setAllowedDirectories`) — running it unmodified, rather than
 * reimplementing it, is the point: this worked example is evidence
 * Continuum doesn't interfere with a wrapped server's own security logic.
 *
 * Two tools are registered here — `read_text_file` and `list_directory` —
 * copied verbatim (name, schema, and handler body) from
 * `src/filesystem/index.ts`, version 2026.7.10:
 *   https://github.com/modelcontextprotocol/servers/blob/main/src/filesystem/index.ts
 * chosen as the minimal pair needed to prove a full round trip that
 * actually touches the filesystem (list, then read) rather than a
 * pure-in-memory tool. The remaining ~10 filesystem tools (write, edit,
 * move, search, media, directory trees, roots support, ...) are out of
 * scope here, same as `everything.ts`'s two-tool subset.
 */
import { promises as fs } from "node:fs";
import { z } from "zod";
import { McpServer as LegacyMcpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpServer as ModernMcpServer } from "@modelcontextprotocol/server";
import {
  setAllowedDirectories,
  validatePath,
  readFileContent,
  tailFile,
  headFile,
} from "@modelcontextprotocol/server-filesystem/dist/lib.js";

export const FILESYSTEM_SERVER_INFO = { name: "secure-filesystem-server", version: "2026.7.10" };

/** Verbatim from the real server's `index.ts` `ReadTextFileArgsSchema`. */
const ReadTextFileArgsSchema = z.object({
  path: z.string(),
  tail: z.number().optional().describe("If provided, returns only the last N lines of the file"),
  head: z.number().optional().describe("If provided, returns only the first N lines of the file"),
});

/** Verbatim from the real server's `index.ts` `ListDirectoryArgsSchema`. */
const ListDirectoryArgsSchema = z.object({
  path: z.string(),
});

/** Verbatim from the real server's `index.ts` `readTextFileHandler`. */
async function readTextFileHandler(args: z.infer<typeof ReadTextFileArgsSchema>) {
  const validPath = await validatePath(args.path);

  if (args.head && args.tail) {
    throw new Error("Cannot specify both head and tail parameters simultaneously");
  }

  let content: string;
  if (args.tail) {
    content = await tailFile(validPath, args.tail);
  } else if (args.head) {
    content = await headFile(validPath, args.head);
  } else {
    content = await readFileContent(validPath);
  }

  return {
    content: [{ type: "text" as const, text: content }],
    structuredContent: { content },
  };
}

/** Verbatim from the real server's `index.ts` `list_directory` handler. */
async function listDirectoryHandler(args: z.infer<typeof ListDirectoryArgsSchema>) {
  const validPath = await validatePath(args.path);
  const entries = await fs.readdir(validPath, { withFileTypes: true });
  const formatted = entries.map((entry) => `${entry.isDirectory() ? "[DIR]" : "[FILE]"} ${entry.name}`).join("\n");
  return {
    content: [{ type: "text" as const, text: formatted }],
    structuredContent: { content: formatted },
  };
}

/**
 * `[name, config, handler]` registration triples, defined once each and
 * called from inside every concretely-typed factory below — not from a
 * shared function typed to accept `LegacyMcpServer | ModernMcpServer` (nor
 * iterated from a shared heterogeneous array, which loses the same
 * type correlation a different way), because TypeScript cannot resolve an
 * overloaded `registerTool` call through a union of the two distinct SDK
 * generations' classes (see `sequential-thinking.ts` for the same note in
 * more detail).
 */
function readTextFileToolRegistration() {
  return {
    name: "read_text_file" as const,
    config: {
      title: "Read Text File",
      description:
        "Read the complete contents of a file from the file system as text. " +
        "Use the 'head' parameter to read only the first N lines, or 'tail' for the last N lines. " +
        "Only works within allowed directories.",
      inputSchema: ReadTextFileArgsSchema.shape,
      outputSchema: { content: z.string() },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    handler: readTextFileHandler,
  };
}

function listDirectoryToolRegistration() {
  return {
    name: "list_directory" as const,
    config: {
      title: "List Directory",
      description:
        "Get a detailed listing of all files and directories in a specified path. " +
        "Results distinguish files and directories with [FILE] and [DIR] prefixes. " +
        "Only works within allowed directories.",
      inputSchema: ListDirectoryArgsSchema.shape,
      outputSchema: { content: z.string() },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    handler: listDirectoryHandler,
  };
}

/**
 * Restricts `validatePath` (shared module-level state inside the imported
 * `dist/lib.js`, exactly as in the real server) to `allowedDirectory` before
 * building either server generation. Must be called before either factory
 * runs, matching the real CLI's own startup order (`setAllowedDirectories`
 * before the transport connects).
 */
export function configureFilesystemSandbox(allowedDirectory: string): void {
  setAllowedDirectories([allowedDirectory]);
}

/** Builds the legacy-generation server. See `everything.ts` for why one factory per SDK generation is required. */
export function createLegacyFilesystemServer(): LegacyMcpServer {
  const server = new LegacyMcpServer(FILESYSTEM_SERVER_INFO);
  const readTextFile = readTextFileToolRegistration();
  server.registerTool(readTextFile.name, readTextFile.config, readTextFile.handler);
  const listDirectory = listDirectoryToolRegistration();
  server.registerTool(listDirectory.name, listDirectory.config, listDirectory.handler);
  return server;
}

/** Builds the modern-generation server. See above. */
export function createModernFilesystemServer(): ModernMcpServer {
  const server = new ModernMcpServer(FILESYSTEM_SERVER_INFO);
  const readTextFile = readTextFileToolRegistration();
  server.registerTool(readTextFile.name, readTextFile.config, readTextFile.handler);
  const listDirectory = listDirectoryToolRegistration();
  server.registerTool(listDirectory.name, listDirectory.config, listDirectory.handler);
  return server;
}
