import assert from "node:assert/strict";
import { createServer, type Server as HttpServer } from "node:http";
import { test } from "node:test";
import { McpServer as LegacyMcpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpServer as ModernMcpServer } from "@modelcontextprotocol/server";
import { continuum } from "./continuum.js";
import { createStatelessResponder } from "./modern.js";
import { runLegacyClientProbe } from "./probe.js";

function makeLegacyServer(): LegacyMcpServer {
  const server = new LegacyMcpServer({ name: "continuum-probe-test-server", version: "0.0.0" });
  server.registerTool(
    "ping",
    { description: "Replies with pong" },
    async () => ({ content: [{ type: "text", text: "pong" }] }),
  );
  return server;
}

function makeModernServer(): ModernMcpServer {
  const server = new ModernMcpServer({ name: "continuum-probe-test-modern-server", version: "0.0.0" });
  server.registerTool(
    "ping",
    { description: "Replies with pong" },
    async () => ({ content: [{ type: "text", text: "pong" }] }),
  );
  return server;
}

async function startHttpServer(
  handleRequest: (req: any, res: any, parsedBody: unknown) => Promise<void>,
): Promise<{ url: string; http: HttpServer }> {
  const http = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const raw = Buffer.concat(chunks).toString("utf8");
    const parsedBody = raw.length > 0 ? JSON.parse(raw) : undefined;
    await handleRequest(req, res, parsedBody);
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  const address = http.address();
  if (address === null || typeof address === "string") {
    throw new Error("expected an AddressInfo from a TCP listener");
  }
  return { url: `http://127.0.0.1:${address.port}/mcp`, http };
}

test("runLegacyClientProbe: a full round trip against a continuum-wrapped server passes every step", async () => {
  const wrapper = continuum({ createLegacyServer: makeLegacyServer, createModernServer: makeModernServer });
  const { url, http } = await startHttpServer((req, res, body) => wrapper.handleRequest(req, res, body));
  try {
    const result = await runLegacyClientProbe({ url, toolName: "ping" });
    assert.equal(result.ok, true);
    assert.equal(result.steps.length, 3);
    assert.ok(result.steps.every((step) => step.ok));
    assert.ok(result.sessionId);
    assert.equal(wrapper.legacySessionCount, 1);
    assert.deepEqual((result.toolResult as any).content[0].text, "pong");
  } finally {
    await wrapper.close();
    http.close();
  }
});

test("runLegacyClientProbe: an unknown tool fails the tools/call step but reports the earlier steps as passing", async () => {
  const wrapper = continuum({ createLegacyServer: makeLegacyServer, createModernServer: makeModernServer });
  const { url, http } = await startHttpServer((req, res, body) => wrapper.handleRequest(req, res, body));
  try {
    const result = await runLegacyClientProbe({ url, toolName: "does-not-exist" });
    assert.equal(result.ok, false);
    const [initStep, initializedStep, toolStep] = result.steps;
    assert.equal(initStep.ok, true);
    assert.equal(initializedStep.ok, true);
    assert.equal(toolStep.name, "tools/call");
    assert.equal(toolStep.ok, false);
    assert.match(toolStep.detail, /error/i);
  } finally {
    await wrapper.close();
    http.close();
  }
});

test("runLegacyClientProbe: a server that only speaks the modern stateless path fails at initialize", async () => {
  const responder = createStatelessResponder({ createServer: makeModernServer });
  const { url, http } = await startHttpServer((req, res, body) => responder.handleRequest(req, res, body));
  try {
    const result = await runLegacyClientProbe({ url, toolName: "ping" });
    assert.equal(result.ok, false);
    assert.equal(result.steps.length, 1);
    assert.equal(result.steps[0].name, "initialize");
    assert.equal(result.steps[0].ok, false);
  } finally {
    await responder.close();
    http.close();
  }
});

test("runLegacyClientProbe: a network failure is captured as a failed step, not thrown", async () => {
  const result = await runLegacyClientProbe({
    url: "http://127.0.0.1:1/mcp",
    toolName: "ping",
  });
  assert.equal(result.ok, false);
  assert.equal(result.steps.length, 1);
  assert.equal(result.steps[0].name, "initialize");
  assert.equal(result.steps[0].ok, false);
});
