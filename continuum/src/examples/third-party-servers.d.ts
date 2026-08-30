/**
 * Ambient type declarations for the pure (side-effect-free) library submodules of two real
 * open-source MCP servers this checklist item wraps directly — `sequential-thinking.ts` and
 * `filesystem.ts` import real, installed code from these packages, not a reproduction, but
 * neither package ships `.d.ts` files for its `dist/*.js` submodules (only `dist/index.js`,
 * their CLI entry point, is typed indirectly via the package's own build — and that entry
 * point can't be imported at all, since it runs `main()` at module scope with no guard).
 * These declarations describe only the functions actually used here, copied from each
 * package's own TypeScript source (see the comments in `sequential-thinking.ts` /
 * `filesystem.ts` for exact provenance) — not invented signatures.
 */

declare module "@modelcontextprotocol/server-sequential-thinking/dist/lib.js" {
  export interface ThoughtData {
    thought: string;
    thoughtNumber: number;
    totalThoughts: number;
    isRevision?: boolean;
    revisesThought?: number;
    branchFromThought?: number;
    branchId?: string;
    needsMoreThoughts?: boolean;
    nextThoughtNeeded: boolean;
  }

  export class SequentialThinkingServer {
    processThought(input: ThoughtData): { content: Array<{ type: "text"; text: string }>; isError?: boolean };
  }
}

declare module "@modelcontextprotocol/server-filesystem/dist/lib.js" {
  export function setAllowedDirectories(directories: string[]): void;
  export function getAllowedDirectories(): string[];
  export function validatePath(requestedPath: string): Promise<string>;
  export function readFileContent(filePath: string, encoding?: string): Promise<string>;
  export function tailFile(filePath: string, numLines: number): Promise<string>;
  export function headFile(filePath: string, numLines: number): Promise<string>;
}
