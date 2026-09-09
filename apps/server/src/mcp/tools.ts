import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { assetIdSchema } from "../asset/schema.js";
import type { StructuredLogger } from "../logging.js";
import type { KnowledgeService } from "../knowledge/service.js";
import { KnowledgeError, recallInputSchema, readInputSchema, usedInputSchema, capabilityIdsSchema, referenceSchema, hashSchema } from "../knowledge/model.js";
import { AssetNotAccessibleError, AssetNotFoundError, AssetSearchUnavailableError } from "../asset/index.js";
export { recallInputSchema };
// MCP requires an object root; services retain the strict mutually exclusive unions.
export const assetReadToolInputSchema = z.object({
  capabilityIds: capabilityIdsSchema,
  recallItemId: referenceSchema.optional(),
  assetId: assetIdSchema.optional(),
  expectedContentHash: hashSchema.optional(),
}).strict().refine((input) => readInputSchema.safeParse(input).success,
  { message: "Provide either recallItemId or assetId with optional expectedContentHash." });
export const assetMarkUsedToolInputSchema = z.object({
  capabilityIds: capabilityIdsSchema,
  recallItemId: referenceSchema.optional(),
  readRef: referenceSchema.optional(),
}).strict().refine((input) => usedInputSchema.safeParse(input).success,
  { message: "Provide exactly one of recallItemId or readRef." });
export interface AssetMcpDependencies {
  knowledgeService: KnowledgeService; logger: StructuredLogger; onInternalError?: (error: unknown) => void;
}
export function createAssetMcpServer(dependencies: AssetMcpDependencies): McpServer {
  const server = new McpServer({ name: "codex-memory-os", version: "2.4.0" });
  const execute = async (operation: () => Promise<unknown>): Promise<CallToolResult> => {
    try {
      // Exactly one serialized representation: no duplicate structuredContent.
      return { content: [{ type: "text", text: JSON.stringify(await operation()) }] };
    } catch (error) {
      let code = "INTERNAL_ERROR";
      if (error instanceof KnowledgeError) code = error.code;
      else if (error instanceof AssetNotAccessibleError || error instanceof AssetNotFoundError) code = "ASSET_NOT_ACCESSIBLE";
      else if (error instanceof AssetSearchUnavailableError) code = error.reason === "WORKSPACE_CONFIGURATION" ? "WORKSPACE_CONFIG_UNAVAILABLE" : "ASSET_INDEX_UNAVAILABLE";
      else dependencies.onInternalError?.(error);
      return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: { code } }) }] };
    }
  };
  server.registerTool("knowledge_recall", { description: "Recall knowledge with 1–8 concise search expressions in queries. Generate relevant terms and synonyms as you would for native memory; reuse suitable expressions for the same purpose. Terms within an expression are AND; expressions are OR. One deduplicated result shares the 8-asset/5000-character budget. Explicit capabilityIds selects scope; [] selects GLOBAL only.", inputSchema: recallInputSchema },
    async (input) => execute(() => dependencies.knowledgeService.recall(input)));
  server.registerTool("asset_read", { description: "Read qualified current content. Provide exactly one target: recallItemId, or assetId with optional expectedContentHash.", inputSchema: assetReadToolInputSchema },
    async (input) => execute(() => dependencies.knowledgeService.read(input)));
  server.registerTool("asset_mark_used", { description: "Explicitly settle a persistent source that influenced work. Provide exactly one of recallItemId or readRef. Content evolution does not invalidate Used.", inputSchema: assetMarkUsedToolInputSchema,
    annotations: { readOnlyHint: false, idempotentHint: true, destructiveHint: false } },
    async (input) => execute(() => dependencies.knowledgeService.used(input)));
  return server;
}
