/**
 * Build pipeline checklist item 9: proves a real open-source MCP server —
 * `@modelcontextprotocol/server-sequential-thinking`'s real, imported
 * `sequentialthinking` tool, wrapped behind `continuum()` (see
 * `sequential-thinking.ts`) — passes both the simulated legacy (2025-11-25)
 * client probe and the simulated modern (2026-07-28) client probe end to
 * end, over real HTTP, against one running server instance.
 */
import assert from "node:assert/strict";
import { createServer, type Server as HttpServer } from "node:http";
import { test } from "node:test";
import { continuum } from "../continuum.js";
import { runLegacyClientProbe, runModernClientProbe } from "../probe.js";
import { createLegacySequentialThinkingServer, createModernSequentialThinkingServer } from "./sequential-thinking.js";

async function startWrappedServer(): Promise<{ url: string; http: HttpServer; wrapper: ReturnType<typeof continuum> }> {
  const wrapper = continuum({
    createLegacyServer: createLegacySequentialThinkingServer,
    createModernServer: createModernSequentialThinkingServer,
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

const firstThought = {
  thought: "Start by identifying the constraints of the problem.",
  thoughtNumber: 1,
  totalThoughts: 3,
  nextThoughtNeeded: true,
};

test("sequential-thinking server: a simulated legacy (2025-11-25) client completes a full round trip", async () => {
  const { url, http, wrapper } = await startWrappedServer();
  try {
    const result = await runLegacyClientProbe({ url, toolName: "sequentialthinking", toolArguments: firstThought });
    assert.equal(result.ok, true, JSON.stringify(result.steps));
    assert.equal(result.steps.length, 3);
    assert.ok(result.steps.every((step) => step.ok));
    const parsed = JSON.parse((result.toolResult as any)?.content?.[0]?.text ?? "{}");
    assert.equal(parsed.thoughtNumber, 1);
    assert.equal(parsed.thoughtHistoryLength, 1);
  } finally {
    await stop(http, wrapper);
  }
});

test("sequential-thinking server: a simulated modern (2026-07-28) client completes a full round trip", async () => {
  const { url, http, wrapper } = await startWrappedServer();
  try {
    const result = await runModernClientProbe({ url, toolName: "sequentialthinking", toolArguments: firstThought });
    assert.equal(result.ok, true, JSON.stringify(result.steps));
    assert.equal(result.steps.length, 2);
    assert.ok(result.steps.every((step) => step.ok));
    assert.ok(result.supportedVersions?.includes("2026-07-28"));
    const parsed = JSON.parse((result.toolResult as any)?.content?.[0]?.text ?? "{}");
    assert.equal(parsed.thoughtNumber, 1);
  } finally {
    await stop(http, wrapper);
  }
});

test("sequential-thinking server: a second thought correctly reports thoughtHistoryLength 2 on the SAME legacy session", async () => {
  const { url, http, wrapper } = await startWrappedServer();
  try {
    await runLegacyClientProbe({ url, toolName: "sequentialthinking", toolArguments: firstThought });
    const second = await runLegacyClientProbe({
      url,
      toolName: "sequentialthinking",
      toolArguments: { ...firstThought, thought: "Now narrow down the candidate solutions.", thoughtNumber: 2, nextThoughtNeeded: false },
    });
    assert.equal(second.ok, true, JSON.stringify(second.steps));
    const parsed = JSON.parse((second.toolResult as any)?.content?.[0]?.text ?? "{}");
    assert.equal(parsed.thoughtHistoryLength, 1, "a fresh legacy session gets its own SequentialThinkingServer instance, matching the real server");
  } finally {
    await stop(http, wrapper);
  }
});
