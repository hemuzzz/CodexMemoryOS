import { z } from "zod";

export const LOADOUT_REASON_VALUES = [
  "MEMORY_STRONG_MATCH",
  "MEMORY_MATCH",
  "DOCUMENT_ON_DEMAND",
  "SKILL_ON_DEMAND",
  "DIRECT_BUDGET_DOWNGRADED",
] as const;

export type LoadoutReason = (typeof LOADOUT_REASON_VALUES)[number];

export const loadoutReasonSchema = z.enum(LOADOUT_REASON_VALUES);

export const DEFAULT_LOADOUT_POLICY = {
  minScore: 200,
  directMemoryMinScore: 300,
  maxInjectedCharacters: 3000,
  maxAssets: 8,
} as const;

export const LOADOUT_MIN_SCORE = DEFAULT_LOADOUT_POLICY.minScore;
export const DIRECT_MEMORY_MIN_SCORE = DEFAULT_LOADOUT_POLICY.directMemoryMinScore;
export const DEFAULT_MAX_INJECTED_CHARACTERS = DEFAULT_LOADOUT_POLICY.maxInjectedCharacters;
export const DEFAULT_MAX_LOADOUT_ASSETS = DEFAULT_LOADOUT_POLICY.maxAssets;

export const loadoutModeSchema = z.enum(["DIRECT", "ON_DEMAND"]);

export const taskLoadoutAssetSchema = z
  .object({
    assetId: z.string().regex(/^ast[0-9]+$/u),
    mode: loadoutModeSchema,
    reason: loadoutReasonSchema,
    estimatedCharacters: z.number().int().nonnegative().safe(),
  })
  .strict();

export const taskLoadoutSchema = z
  .object({
    schemaVersion: z.literal(1),
    limits: z
      .object({
        maxInjectedCharacters: z.literal(DEFAULT_MAX_INJECTED_CHARACTERS),
        maxAssets: z.literal(DEFAULT_MAX_LOADOUT_ASSETS),
      })
      .strict(),
    assets: z.array(taskLoadoutAssetSchema).max(DEFAULT_MAX_LOADOUT_ASSETS),
  })
  .strict();

export type LoadoutMode = z.infer<typeof loadoutModeSchema>;
export type TaskLoadoutAsset = z.infer<typeof taskLoadoutAssetSchema>;
export type TaskLoadout = z.infer<typeof taskLoadoutSchema>;

export function createEmptyTaskLoadout(): TaskLoadout {
  return {
    schemaVersion: 1,
    limits: {
      maxInjectedCharacters: DEFAULT_MAX_INJECTED_CHARACTERS,
      maxAssets: DEFAULT_MAX_LOADOUT_ASSETS,
    },
    assets: [],
  };
}
