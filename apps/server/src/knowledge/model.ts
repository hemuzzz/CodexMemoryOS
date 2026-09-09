import { z } from "zod";
import { assetIdSchema } from "../asset/schema.js";

export class KnowledgeError extends Error {
  constructor(readonly code: string) { super(code); this.name = "KnowledgeError"; }
}
export const capabilityIdsSchema = z.array(z.string().regex(/^cap_[A-Za-z0-9_-]{43}$/u)).max(8);
export const referenceSchema = z.string().regex(/^usg[0-9]+$/u);
export const hashSchema = z.string().regex(/^[a-f0-9]{64}$/u);
export const recallInputSchema = z.object({
  capabilityIds: capabilityIdsSchema,
  queries: z.array(z.string().trim().min(1).max(256).regex(/^[^\u0000-\u001f\u007f]+$/u)).min(1).max(8),
  scenarios: z.array(z.string().min(1).max(40)).max(4).default([]),
}).strict();
export const readInputSchema = z.union([
  z.object({ capabilityIds: capabilityIdsSchema, recallItemId: referenceSchema }).strict(),
  z.object({ capabilityIds: capabilityIdsSchema, assetId: assetIdSchema, expectedContentHash: hashSchema.optional() }).strict(),
]);
export const usedInputSchema = z.union([
  z.object({ capabilityIds: capabilityIdsSchema, recallItemId: referenceSchema }).strict(),
  z.object({ capabilityIds: capabilityIdsSchema, readRef: referenceSchema }).strict(),
]);
export const scenarioInputSchema = z.object({ capabilityIds: capabilityIdsSchema,
  offset: z.number().int().min(0).max(1000).default(0), limit: z.number().int().min(1).max(20).default(20),
}).strict();
export interface Source {
  assetId: string; contentHash: string; assetScope: "GLOBAL" | "WORKSPACE"; assetWorkspace: string | null;
}
export interface RecallItem extends Source {
  recallItemId: string | null; title: string; type: "MEMORY" | "DOCUMENT" | "SKILL";
  selectionReasons: string[]; bucket: "DIRECT" | "QUERY"; requestedMode?: "DIRECT" | "ON_DEMAND";
  deliveredMode: "DIRECT" | "ON_DEMAND"; deliveryReasons: string[]; summary?: string; reference: string;
}
export interface Budget {
  maxAssets: number; maxModelVisibleCharacters: number; modelVisibleCharacters: number;
  knowledgeContentCharacters: number; metadataCharacters: number; deliveredAssets: number;
  directBucketAssets: number; queryBucketAssets: number; omittedCount: number; downgradedCount: number;
}
export interface RecallResult {
  usageRecorded: boolean; recallId: string | null; authorizedWorkspaces: string[]; queries: string[];
  scenarios: string[]; policyHash?: string; occurredAt: string; items: RecallItem[]; diagnostics: string[]; budget: Budget;
}
export interface ReadFact extends Source {
  readRef: string; authorizedWorkspaces: string[]; recallItemId: string | null; occurredAt: string;
}
export interface UsedFact { usedId: string; assetId: string; authorizedWorkspaces: string[];
  recallItemId: string | null; directReadRef: string | null; occurredAt: string; }
