/**
 * Build pipeline checklist item 9: proves a real open-source MCP server —
 * `@modelcontextprotocol/server-filesystem`'s real, imported `read_text_file`
 * and `list_directory` tools, wrapped behind `continuum()` (see
 * `filesystem.ts`) — passes both the simulated legacy (2025-11-25) client
 * probe and the simulated modern (2026-07-28) client probe end to end, over
 * real HTTP, against one running server instance, including the real
 * server's own directory-confinement check (`validatePath`) rejecting a
 * path outside the sandbox.
 */
import assert from "node:assert/strict";
import { createServer, type Server as HttpServer } from "node:http";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { continuum } from "../continuum.js";
import { runLegacyClientProbe, runModernClientProbe } from "../probe.js";
import { configureFilesystemSandbox, createLegacyFilesystemServer, createModernFilesystemServer } from "./filesystem.js";

async function startWrappedServer(sandboxDir: string): Promise<{ url: string; http: HttpServer; wrapper: ReturnType<typeof continuum> }> {
  configureFilesystemSandbox(sandboxDir);
  const wrapper = continuum({
    createLegacyServer: createLegacyFilesystemServer,
    createModernServer: createModernFilesystemServer,
  });
  const http = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const raw = Buffer.concat(chunks).toString("utf8");
    const parsedBody = raw.length > 0 ? JSON.parse(raw) : undefined;
    await wrapper.handleRequest(req, res, parsedBody);
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  const address = http.address();
  if (address === null || typeof address === "string") {
    throw new Error("expected an AddressInfo from a TCP listener");
  }
  return { url: `http://127.0.0.1:${address.port}/mcp`, http, wrapper };
}

async function stop(http: HttpServer, wrapper: ReturnType<typeof continuum>): Promise<void> {
  await wrapper.close();
  await new Promise<void>((resolve) => http.close(() => resolve()));
}

async function withSandbox(run: (sandboxDir: string) => Promise<void>): Promise<void> {
  const sandboxDir = await mkdtemp(path.join(tmpdir(), "continuum-filesystem-example-"));
  try {
    await writeFile(path.join(sandboxDir, "hello.txt"), "hello from continuum\n", "utf8");
    await run(sandboxDir);
  } finally {
    await rm(sandboxDir, { recursive: true, force: true });
  }
}

test("filesystem server: a simulated legacy (2025-11-25) client reads a real file end to end", () =>
  withSandbox(async (sandboxDir) => {
    const { url, http, wrapper } = await startWrappedServer(sandboxDir);
    try {
      const result = await runLegacyClientProbe({ url, toolName: "read_text_file", toolArguments: { path: path.join(sandboxDir, "hello.txt") } });
      assert.equal(result.ok, true, JSON.stringify(result.steps));
      assert.match((result.toolResult as any)?.content?.[0]?.text ?? "", /hello from continuum/);
    } finally {
      await stop(http, wrapper);
    }
  }));

test("filesystem server: a simulated modern (2026-07-28) client lists a real directory end to end", () =>
  withSandbox(async (sandboxDir) => {
    const { url, http, wrapper } = await startWrappedServer(sandboxDir);
    try {
      const result = await runModernClientProbe({ url, toolName: "list_directory", toolArguments: { path: sandboxDir } });
      assert.equal(result.ok, true, JSON.stringify(result.steps));
      assert.ok(result.supportedVersions?.includes("2026-07-28"));
      assert.match((result.toolResult as any)?.content?.[0]?.text ?? "", /\[FILE\] hello\.txt/);
    } finally {
      await stop(http, wrapper);
    }
  }));

test("filesystem server: the real server's own validatePath rejects a path outside the sandbox on BOTH probes", () =>
  withSandbox(async (sandboxDir) => {
    const { url, http, wrapper } = await startWrappedServer(sandboxDir);
    try {
      const outsidePath = path.join(tmpdir(), "outside-the-sandbox.txt");
      const [legacy, modern] = await Promise.all([
        runLegacyClientProbe({ url, toolName: "read_text_file", toolArguments: { path: outsidePath } }),
        runModernClientProbe({ url, toolName: "read_text_file", toolArguments: { path: outsidePath } }),
      ]);
      assert.equal(legacy.ok, false);
      assert.match(JSON.stringify(legacy.toolResult), /Access denied/);
      assert.equal(modern.ok, false);
      assert.match(JSON.stringify(modern.toolResult), /Access denied/);
    } finally {
      await stop(http, wrapper);
    }
  }));
