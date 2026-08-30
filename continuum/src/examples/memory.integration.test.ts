/**
 * Build pipeline checklist item 9: proves a real open-source MCP server —
 * `@modelcontextprotocol/server-memory`'s `create_entities`/`read_graph`
 * tools, backed by its `KnowledgeGraphManager` reproduced unmodified (see
 * `memory.ts`), wrapped behind `continuum()` — passes both the simulated
 * legacy (2025-11-25) client probe and the simulated modern (2026-07-28)
 * client probe end to end, over real HTTP, against one running server
 * instance, with state persisted to the same on-disk JSONL format the real
 * server itself uses.
 */
import assert from "node:assert/strict";
import { createServer, type Server as HttpServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { continuum } from "../continuum.js";
import { runLegacyClientProbe, runModernClientProbe } from "../probe.js";
import { createLegacyMemoryServer, createModernMemoryServer } from "./memory.js";

async function startWrappedServer(memoryFilePath: string): Promise<{ url: string; http: HttpServer; wrapper: ReturnType<typeof continuum> }> {
  const wrapper = continuum({
    createLegacyServer: () => createLegacyMemoryServer(memoryFilePath),
    createModernServer: () => createModernMemoryServer(memoryFilePath),
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

async function withMemoryFile(run: (memoryFilePath: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), "continuum-memory-example-"));
  try {
    await run(path.join(dir, "memory.jsonl"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("memory server: a simulated legacy (2025-11-25) client creates a real entity end to end", () =>
  withMemoryFile(async (memoryFilePath) => {
    const { url, http, wrapper } = await startWrappedServer(memoryFilePath);
    try {
      const result = await runLegacyClientProbe({
        url,
        toolName: "create_entities",
        toolArguments: { entities: [{ name: "Continuum", entityType: "project", observations: ["dual-stack MCP middleware"] }] },
      });
      assert.equal(result.ok, true, JSON.stringify(result.steps));
      assert.match((result.toolResult as any)?.content?.[0]?.text ?? "", /Continuum/);
    } finally {
      await stop(http, wrapper);
    }
  }));

test("memory server: a simulated modern (2026-07-28) client reads back an entity created via the legacy path — same file, both specs", () =>
  withMemoryFile(async (memoryFilePath) => {
    const { url, http, wrapper } = await startWrappedServer(memoryFilePath);
    try {
      const created = await runLegacyClientProbe({
        url,
        toolName: "create_entities",
        toolArguments: { entities: [{ name: "RFC-2597", entityType: "reference", observations: ["dual-stack pattern source"] }] },
      });
      assert.equal(created.ok, true, JSON.stringify(created.steps));

      const read = await runModernClientProbe({ url, toolName: "read_graph" });
      assert.equal(read.ok, true, JSON.stringify(read.steps));
      assert.ok(read.supportedVersions?.includes("2026-07-28"));
      const graph = JSON.parse((read.toolResult as any)?.content?.[0]?.text ?? "{}");
      assert.ok(graph.entities.some((e: any) => e.name === "RFC-2597"), JSON.stringify(graph));
    } finally {
      await stop(http, wrapper);
    }
  }));
