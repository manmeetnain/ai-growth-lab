/**
 * Real-server worked example #4 (build pipeline checklist item 9): wraps two
 * tools from `@modelcontextprotocol/server-memory` — an official
 * modelcontextprotocol.io reference server, itself built on
 * `@modelcontextprotocol/sdk@^1.29.0` (the exact legacy generation Continuum
 * targets, see RESEARCH.md) — behind `continuum()`.
 *
 * Unlike `sequential-thinking.ts` / `filesystem.ts`, this package keeps all
 * of its logic in one file (`src/index.ts`) with no separate library
 * submodule, and that file's `main()` runs unconditionally at module scope
 * (connects a stdio transport immediately) — so, as with `everything.ts`,
 * there is no module of this package that can be safely imported. Per
 * CAPSTONE.md's pattern ("no rewrite of the server's actual tool/resource
 * logic"), the reusable piece — the `KnowledgeGraphManager` class, which is
 * itself self-contained and side-effect-free at the class-definition level
 * — is reproduced verbatim below, copied unmodified from the published
 * source, version 2026.7.4:
 *   https://github.com/modelcontextprotocol/servers/blob/main/src/memory/index.ts
 *
 * Two of the real server's eight tools are registered here —
 * `create_entities` (a mutation) and `read_graph` (a read) — chosen as the
 * minimal pair needed to prove a full, stateful round trip: create real
 * graph state through one tool call, then read it back through another,
 * against the same on-disk JSONL file the real server itself uses. The
 * remaining six tools (relations, observations, search, deletes, resource
 * subscriptions) are out of scope here, same as `everything.ts`'s subset.
 */
import { promises as fs } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import { McpServer as LegacyMcpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpServer as ModernMcpServer } from "@modelcontextprotocol/server";

export const MEMORY_SERVER_INFO = { name: "memory-server", version: "0.6.3" };

// --- Verbatim from the real server's `index.ts` (interfaces + KnowledgeGraphManager) ---

export interface Entity {
  name: string;
  entityType: string;
  observations: string[];
}

export interface Relation {
  from: string;
  to: string;
  relationType: string;
}

export interface KnowledgeGraph {
  entities: Entity[];
  relations: Relation[];
}

export class KnowledgeGraphManager {
  constructor(private memoryFilePath: string) {}

  private async loadGraph(): Promise<KnowledgeGraph> {
    try {
      const data = await fs.readFile(this.memoryFilePath, "utf-8");
      const lines = data.split("\n").filter((line) => line.trim() !== "");
      return lines.reduce(
        (graph: KnowledgeGraph, line) => {
          const item = JSON.parse(line);
          if (item.type === "entity") {
            graph.entities.push({ name: item.name, entityType: item.entityType, observations: item.observations });
          }
          if (item.type === "relation") {
            graph.relations.push({ from: item.from, to: item.to, relationType: item.relationType });
          }
          return graph;
        },
        { entities: [], relations: [] },
      );
    } catch (error) {
      if (error instanceof Error && "code" in error && (error as any).code === "ENOENT") {
        return { entities: [], relations: [] };
      }
      throw error;
    }
  }

  private async saveGraph(graph: KnowledgeGraph): Promise<void> {
    const lines = [
      ...graph.entities.map((e) =>
        JSON.stringify({ type: "entity", name: e.name, entityType: e.entityType, observations: e.observations }),
      ),
      ...graph.relations.map((r) => JSON.stringify({ type: "relation", from: r.from, to: r.to, relationType: r.relationType })),
    ];

    const directory = path.dirname(this.memoryFilePath);
    const tempFilePath = path.join(directory, `${path.basename(this.memoryFilePath)}.${randomBytes(16).toString("hex")}.tmp`);

    try {
      await fs.writeFile(tempFilePath, lines.join("\n"));
      await fs.rename(tempFilePath, this.memoryFilePath);
    } catch (error) {
      await fs.unlink(tempFilePath).catch(() => {});
      throw error;
    }
  }

  async createEntities(entities: Entity[]): Promise<Entity[]> {
    const graph = await this.loadGraph();
    const newEntities = entities.filter((e) => !graph.entities.some((existingEntity) => existingEntity.name === e.name));
    graph.entities.push(...newEntities);
    await this.saveGraph(graph);
    return newEntities;
  }

  async readGraph(): Promise<KnowledgeGraph> {
    return this.loadGraph();
  }
}

// --- End verbatim reproduction ---

/** Verbatim from the real server's `index.ts` `EntitySchema`. */
const EntitySchema = z.object({
  name: z.string().describe("The name of the entity"),
  entityType: z.string().describe("The type of the entity"),
  observations: z.array(z.string()).describe("An array of observation contents associated with the entity"),
});

/**
 * `[name, config, handler]` registration triples, defined once each and
 * called from inside every concretely-typed factory below — not from a
 * shared function typed to accept `LegacyMcpServer | ModernMcpServer`,
 * because TypeScript cannot resolve an overloaded `registerTool` call
 * through a union of the two distinct SDK generations' classes (see
 * `sequential-thinking.ts` for the same note in more detail).
 */
function createEntitiesToolRegistration(manager: KnowledgeGraphManager) {
  return {
    name: "create_entities" as const,
    config: {
      title: "Create Entities",
      description: "Create multiple new entities in the knowledge graph",
      inputSchema: { entities: z.array(EntitySchema) },
      outputSchema: { entities: z.array(EntitySchema) },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    handler: async ({ entities }: { entities: Entity[] }) => {
      const result = await manager.createEntities(entities);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        structuredContent: { entities: result },
      };
    },
  };
}

function readGraphToolRegistration(manager: KnowledgeGraphManager) {
  return {
    name: "read_graph" as const,
    config: {
      title: "Read Graph",
      description: "Read the entire knowledge graph",
      inputSchema: {},
      outputSchema: { entities: z.array(EntitySchema), relations: z.array(z.object({ from: z.string(), to: z.string(), relationType: z.string() })) },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    handler: async () => {
      const graph = await manager.readGraph();
      return {
        content: [{ type: "text" as const, text: JSON.stringify(graph, null, 2) }],
        structuredContent: { ...graph },
      };
    },
  };
}

/**
 * Builds the legacy-generation server, backed by a fresh `KnowledgeGraphManager`
 * reading/writing `memoryFilePath` — the same on-disk JSONL format the real
 * server persists to. See `everything.ts` for why one factory per SDK
 * generation is required.
 */
export function createLegacyMemoryServer(memoryFilePath: string): LegacyMcpServer {
  const server = new LegacyMcpServer(MEMORY_SERVER_INFO);
  const manager = new KnowledgeGraphManager(memoryFilePath);
  const createEntities = createEntitiesToolRegistration(manager);
  server.registerTool(createEntities.name, createEntities.config, createEntities.handler);
  const readGraph = readGraphToolRegistration(manager);
  server.registerTool(readGraph.name, readGraph.config, readGraph.handler);
  return server;
}

/** Builds the modern-generation server. See above. */
export function createModernMemoryServer(memoryFilePath: string): ModernMcpServer {
  const server = new ModernMcpServer(MEMORY_SERVER_INFO);
  const manager = new KnowledgeGraphManager(memoryFilePath);
  const createEntities = createEntitiesToolRegistration(manager);
  server.registerTool(createEntities.name, createEntities.config, createEntities.handler);
  const readGraph = readGraphToolRegistration(manager);
  server.registerTool(readGraph.name, readGraph.config, readGraph.handler);
  return server;
}
