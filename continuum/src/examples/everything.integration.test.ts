/**
 * Build pipeline checklist item 8: proves a real open-source MCP server —
 * `@modelcontextprotocol/server-everything`'s `echo`/`get-sum` tools,
 * wrapped unmodified behind `continuum()` (see `everything.ts`) — passes
 * both the simulated legacy (2025-11-25) client probe and the simulated
 * modern (2026-07-28) client probe end to end, over real HTTP, against one
 * running server instance.
 */
import assert from "node:assert/strict";
import { createServer, type Server as HttpServer } from "node:http";
import { test } from "node:test";
import { continuum } from "../continuum.js";
import { runLegacyClientProbe, runModernClientProbe } from "../probe.js";
import { createLegacyEverythingServer, createModernEverythingServer } from "./everything.js";

async function startWrappedEverythingServer(): Promise<{
  url: string;
  http: HttpServer;
  wrapper: ReturnType<typeof continuum>;
}> {
  const wrapper = continuum({
    createLegacyServer: createLegacyEverythingServer,
    createModernServer: createModernEverythingServer,
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

test("everything server: a simulated legacy (2025-11-25) client completes a full get-sum round trip", async () => {
  const { url, http, wrapper } = await startWrappedEverythingServer();
  try {
    const result = await runLegacyClientProbe({ url, toolName: "get-sum", toolArguments: { a: 12, b: 30 } });
    assert.equal(result.ok, true, JSON.stringify(result.steps));
    assert.equal(result.steps.length, 3);
    assert.ok(result.steps.every((step) => step.ok));
    assert.match((result.toolResult as any)?.content?.[0]?.text ?? "", /42/);
  } finally {
    await stop(http, wrapper);
  }
});

test("everything server: a simulated modern (2026-07-28) client completes a full get-sum round trip", async () => {
  const { url, http, wrapper } = await startWrappedEverythingServer();
  try {
    const result = await runModernClientProbe({ url, toolName: "get-sum", toolArguments: { a: 12, b: 30 } });
    assert.equal(result.ok, true, JSON.stringify(result.steps));
    assert.equal(result.steps.length, 2);
    assert.ok(result.steps.every((step) => step.ok));
    assert.ok(result.supportedVersions?.includes("2026-07-28"));
    assert.match((result.toolResult as any)?.content?.[0]?.text ?? "", /42/);
  } finally {
    await stop(http, wrapper);
  }
});

test("everything server: both the legacy and modern probes pass end to end against the SAME running instance", async () => {
  const { url, http, wrapper } = await startWrappedEverythingServer();
  try {
    const [legacy, modern] = await Promise.all([
      runLegacyClientProbe({ url, toolName: "echo", toolArguments: { message: "continuum" } }),
      runModernClientProbe({ url, toolName: "echo", toolArguments: { message: "continuum" } }),
    ]);
    assert.equal(legacy.ok, true, JSON.stringify(legacy.steps));
    assert.equal(modern.ok, true, JSON.stringify(modern.steps));
    assert.match((legacy.toolResult as any)?.content?.[0]?.text ?? "", /Echo: continuum/);
    assert.match((modern.toolResult as any)?.content?.[0]?.text ?? "", /Echo: continuum/);
  } finally {
    await stop(http, wrapper);
  }
});
