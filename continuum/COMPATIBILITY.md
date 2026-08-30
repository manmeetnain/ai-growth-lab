# Compatibility results

Build pipeline checklist item 9: results of applying Continuum to real open-source MCP servers
beyond the first one (`@modelcontextprotocol/server-everything`, item 8). For each server below,
Continuum wraps one or more of its **real** tools — imported from the actual published package
where the package ships an importable, side-effect-free library module, or reproduced verbatim
with a cited source where it doesn't (same rule item 8 established) — behind one `continuum()`
instance, and both `runLegacyClientProbe` (2025-11-25) and `runModernClientProbe` (2026-07-28)
complete a full round trip against it. Every row here is backed by a passing integration test
under `src/examples/*.integration.test.ts`, run as part of `npm test`.

| # | Server (npm package, version) | Tools wrapped | Real code reused | Both probes pass |
|---|---|---|---|---|
| 1 | [`@modelcontextprotocol/server-everything`](https://github.com/modelcontextprotocol/servers/tree/main/src/everything) `2026.8.18` | `echo`, `get-sum` | Reproduced verbatim — package ships only a `bin` entry, no importable module | ✅ (`everything.integration.test.ts`) |
| 2 | [`@modelcontextprotocol/server-sequential-thinking`](https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking) `2026.7.4` | `sequentialthinking` | **Imported directly** from the installed package's `dist/lib.js` (`SequentialThinkingServer` class) — a real dependency, not a copy | ✅ (`sequential-thinking.integration.test.ts`, 3 tests incl. legacy-session state isolation) |
| 3 | [`@modelcontextprotocol/server-filesystem`](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem) `2026.7.10` | `read_text_file`, `list_directory` | **Imported directly** from the installed package's `dist/lib.js` (`validatePath`, `readFileContent`, `tailFile`, `headFile`, `setAllowedDirectories`) — real disk I/O against a temp-directory sandbox, real directory-confinement/symlink defense | ✅ (`filesystem.integration.test.ts`, 3 tests incl. a rejected out-of-sandbox path on both specs) |
| 4 | [`@modelcontextprotocol/server-memory`](https://github.com/modelcontextprotocol/servers/tree/main/src/memory) `2026.7.4` | `create_entities`, `read_graph` | `KnowledgeGraphManager` class reproduced verbatim — package's only reusable logic lives in its CLI entry file, which runs `main()` unconditionally at module scope, so it isn't safely importable | ✅ (`memory.integration.test.ts`, 2 tests incl. a legacy-created entity read back by a modern client from the same on-disk file) |

## What this establishes

- **The dual-stack pattern holds across servers with materially different shapes**: a
  stdio-CLI-only tool with a clean library submodule (sequential-thinking), a real-filesystem
  server with nontrivial security logic Continuum must not interfere with (filesystem), and a
  stateful server backed by an on-disk file rather than in-memory session state (memory) — plus
  the original pure in-memory example (everything).
- **Continuum doesn't touch a wrapped server's own logic**, including security-relevant logic:
  the filesystem worked example proves the real `validatePath` symlink/confinement check still
  rejects an out-of-sandbox path identically on both the legacy and modern probe.
- **Legacy and modern clients genuinely interoperate through a wrapped server's real state**, not
  just its wire protocol: the memory worked example has a simulated legacy (2025-11-25) client
  create an entity, then a simulated modern (2026-07-28) client read it back — proof the two specs
  aren't just both "supported" in isolation, but share the same underlying server correctly.
- **Two of three new servers needed zero reproduced logic** — only the packaging choice (CLI-only,
  no `exports` field restricting subpath imports) forced a `dist/lib.js`-style deep import instead
  of a normal `import "package-name"`; see each `src/examples/*.ts` file's header comment for the
  exact reasoning per server, and `third-party-servers.d.ts` for the ambient types their packages
  don't ship.

## Not attempted this pass

`@modelcontextprotocol/server-git` is not published to npm (only available via source clone;
skipped to keep this pass to real, npm-installable dependencies). `@modelcontextprotocol/server-time`
and the `fetch` reference server are Python, out of scope per CAPSTONE.md ("target TypeScript
first"). A fifth TypeScript server (the checklist allows 3-5) was not added this pass since three
already cover materially distinct integration shapes (pure in-memory, real disk I/O, file-backed
state) — revisit if a specific gap surfaces during the edge-case-hardening checklist item.
