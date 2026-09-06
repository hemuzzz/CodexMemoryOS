import { constants } from "node:fs";
import { lstat, open, rename, unlink } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { z } from "zod";
import {
  AssetConfirmationError, assertConfiguration, assertExpectedContentHash,
  assertNoFormalIdConflict, assertTargetAbsent, moveNewInboxAsset,
  requireEligibleInboxAsset, scanFormalAssets, scanInbox, targetPathForInboxPath,
  type AssetConfirmationInput, type AssetConfirmationOptions, type AssetConfirmationResult,
} from "./confirmation.js";
import { AssetContentVersionRepository } from "./content-version.js";
import { assetIdSchema } from "./schema.js";
import { computeContentHash, type ScannedAsset } from "./scanner.js";

const recoverySchema = z.object({
  databasePath: z.string(), relativePath: z.string(), targetRelativePath: z.string(),
  assetId: assetIdSchema, expectedContentHash: z.string().regex(/^[0-9a-f]{64}$/u),
  expectedBaselineHash: z.string().regex(/^[0-9a-f]{64}$/u).nullable(),
  rawContent: z.string(), baselineContent: z.string().nullable(),
}).strict();
type Recovery = z.infer<typeof recoverySchema>;

export async function confirmVersionedInboxAsset(
  input: AssetConfirmationInput, options: AssetConfirmationOptions,
): Promise<AssetConfirmationResult> {
  assertConfiguration(options);
  const mappedTarget = targetPathForInboxPath(input.relativePath);
  assertExpectedContentHash(input.expectedContentHash, input.relativePath);
  const updating = input.updateAssetId !== undefined;
  if (updating !== (input.expectedBaselineHash !== undefined) ||
      (updating && !assetIdSchema.safeParse(input.updateAssetId).success)) {
    throw new AssetConfirmationError("CONFIRM_INPUT_INVALID", "Update requires an Asset ID and baseline hash together");
  }
  if (input.expectedBaselineHash !== undefined) assertExpectedContentHash(input.expectedBaselineHash, input.relativePath);
  // Validate the configured root before touching recovery files or database.
  await scanInbox(options);
  await scanFormalAssets(options);
  if (!options.databasePath || !isAbsolute(options.databasePath)) {
    throw new AssetConfirmationError("CONFIRM_CONFIGURATION_INVALID", "Confirmation requires an absolute database path");
  }
  const recoveryPath = join(options.repositoryPath, ".asset-confirm-recovery.json");
  let versions: AssetContentVersionRepository | undefined;
  let pending = false;
  try {
    versions = new AssetContentVersionRepository(options.databasePath);
    versions.database.exec("BEGIN IMMEDIATE");
    let recovery = await readRecovery(recoveryPath);
    if (recovery !== undefined) {
      if (recovery.databasePath !== options.databasePath || recovery.relativePath !== input.relativePath ||
          recovery.expectedContentHash !== input.expectedContentHash ||
          recovery.expectedBaselineHash !== (input.expectedBaselineHash ?? null) ||
          (updating && recovery.assetId !== input.updateAssetId)) {
        throw new AssetConfirmationError("CONFIRM_RECOVERY_REQUIRED", "An unfinished confirmation requires its exact original invocation");
      }
      // A recovery file is not an arbitrary output-path capability.
      const expectedTarget = targetPathForInboxPath(recovery.relativePath);
      if (recovery.targetRelativePath !== expectedTarget) {
        throw new AssetConfirmationError("CONFIRM_RECOVERY_REQUIRED", "Recovery target identity is invalid");
      }
      verifyRecoveryBytes(recovery);
      pending = true;
    }

    const formal = await scanFormalAssets(options);
    const target = formal.assets.find((asset) => updating
      ? asset.frontmatter.id === input.updateAssetId : asset.relativePath === mappedTarget);
    const rows = versions.read(recovery?.assetId ?? target?.frontmatter.id ?? input.updateAssetId ?? "");
    if (typeof rows === "string") throw new Error("Unexpected content limit");
    const current = rows.find(({ status }) => status === "CURRENT");
    const previous = rows.find(({ status }) => status === "PREVIOUS");
    const inbox = await scanInbox(options);
    const candidate = inbox.assets.find(({ relativePath }) => relativePath === input.relativePath);

    // Completed retries are content-bound. A fresh creation cannot overwrite an
    // unrelated target, and an update retry must still name its adjacent baseline.
    if (target?.contentHash === input.expectedContentHash && current?.contentHash === input.expectedContentHash &&
        (updating ? (input.expectedBaselineHash === current.contentHash || input.expectedBaselineHash === previous?.contentHash)
          : candidate === undefined && !inbox.diagnostics.some(({ path }) => path === input.relativePath))) {
      if (target.relativePath !== mappedTarget || (candidate && candidate.contentHash !== input.expectedContentHash)) {
        throw new AssetConfirmationError("BASELINE_MISMATCH", "Retry identity changed");
      }
      if (recovery || updating) await cleanupCandidate(input, options);
      versions.database.exec("COMMIT");
      if (recovery) await unlink(recoveryPath);
      return result(input, target.frontmatter.id, target.relativePath);
    }

    if (recovery && target?.contentHash === input.expectedContentHash) {
      if ((current?.contentHash ?? null) !== recovery.expectedBaselineHash) {
        throw new AssetConfirmationError("CONFIRM_RECOVERY_REQUIRED", "Recovery database baseline changed");
      }
      if (candidate !== undefined && candidate.contentHash !== input.expectedContentHash) {
        throw new AssetConfirmationError("CONFIRM_RECOVERY_REQUIRED", "Recovery candidate changed");
      }
      await syncFile(join(options.repositoryPath, mappedTarget));
      await syncDirectory(join(options.repositoryPath, ...mappedTarget.split("/").slice(0, -1)));
      versions.rotate(recovery.assetId, recovery.expectedBaselineHash, Buffer.from(recovery.rawContent, "base64"));
    } else {
      const selected = requireEligibleInboxAsset(inbox, input.relativePath);
      if (selected.contentHash !== input.expectedContentHash) {
        throw new AssetConfirmationError("CONTENT_HASH_MISMATCH", "Candidate no longer matches confirmed bytes", input.relativePath);
      }
      if (updating) {
        if (!target || target.relativePath !== mappedTarget || !sameKind(target, selected) ||
            target.frontmatter.id !== selected.frontmatter.id) {
          throw new AssetConfirmationError("UPDATE_ASSET_INVALID", "Update requires the same ID, path, type and scope");
        }
        if (!current || target.contentHash !== input.expectedBaselineHash || current.contentHash !== input.expectedBaselineHash) {
          throw new AssetConfirmationError("BASELINE_MISMATCH", "Formal file and registered CURRENT must match the confirmed baseline");
        }
      } else {
        assertNoFormalIdConflict(formal, selected.frontmatter.id, input.relativePath);
        await assertTargetAbsent(join(options.repositoryPath, mappedTarget), mappedTarget);
        const existing = versions.read(selected.frontmatter.id);
        if (typeof existing === "string" || existing.length > 0) {
          throw new AssetConfirmationError("ASSET_ID_CONFLICT", "Content versions already exist for this ID");
        }
      }
      if (!recovery) {
        recovery = {
          databasePath: options.databasePath, relativePath: input.relativePath, targetRelativePath: mappedTarget,
          assetId: selected.frontmatter.id, expectedContentHash: input.expectedContentHash,
          expectedBaselineHash: input.expectedBaselineHash ?? null,
          rawContent: selected.rawContent.toString("base64"), baselineContent: target?.rawContent.toString("base64") ?? null,
        };
        await writeDurableExclusive(recoveryPath, Buffer.from(JSON.stringify(recovery)));
        pending = true;
        await syncDirectory(options.repositoryPath);
      }
      await options.checkpoint?.("prepared");
      if (updating) {
        // Staging never uses candidate-path reads; the same qualified Buffer
        // supplies the persisted hash, recovery bytes and replacement bytes.
        const stagingPath = join(options.repositoryPath, ".asset-confirm-staging");
        await removeMatchingStaging(stagingPath, input.expectedContentHash);
        await writeDurableExclusive(stagingPath, selected.rawContent);
        const fresh = await scanFormalAssets(options);
        const freshTarget = fresh.assets.find(({ relativePath }) => relativePath === mappedTarget);
        const freshCandidate = requireEligibleInboxAsset(await scanInbox(options), input.relativePath);
        if (freshTarget?.contentHash !== input.expectedBaselineHash ||
            freshTarget?.frontmatter.id !== input.updateAssetId || freshCandidate.contentHash !== input.expectedContentHash) {
          throw new AssetConfirmationError("BASELINE_MISMATCH", "Files changed before replacement");
        }
        await rename(stagingPath, join(options.repositoryPath, mappedTarget));
      } else {
        await moveNewInboxAsset(input, options);
      }
      await syncFile(join(options.repositoryPath, mappedTarget));
      await syncDirectory(join(options.repositoryPath, ...mappedTarget.split("/").slice(0, -1)));
      await options.checkpoint?.("file-written");
      const written = (await scanFormalAssets(options)).assets.find(({ relativePath }) => relativePath === mappedTarget);
      if (written?.contentHash !== input.expectedContentHash || written.frontmatter.id !== selected.frontmatter.id) {
        throw new AssetConfirmationError("CONFIRM_RECOVERY_REQUIRED", "Formal content changed after writing");
      }
      versions.rotate(selected.frontmatter.id, input.expectedBaselineHash ?? null, selected.rawContent);
    }
    versions.database.exec("COMMIT");
    await options.checkpoint?.("database-committed");
    await cleanupCandidate(input, options);
    // Detect edits during cleanup; never rewrite the file to hide them.
    const final = (await scanFormalAssets(options)).assets.find(({ relativePath }) => relativePath === mappedTarget);
    if (final?.contentHash !== input.expectedContentHash) {
      throw new AssetConfirmationError("CONFIRM_RECOVERY_REQUIRED", "Formal content changed after commit");
    }
    await unlink(recoveryPath);
    await syncDirectory(options.repositoryPath);
    pending = false;
    return result(input, recovery.assetId, mappedTarget);
  } catch (error) {
    if (versions?.database.inTransaction) versions.database.exec("ROLLBACK");
    if (isCode(error, "SQLITE_BUSY") && !pending) {
      throw new AssetConfirmationError("CONFIRM_BUSY", "Another database writer is active; retry the same invocation");
    }
    if (pending) {
      // Only discard recovery when failure provably left the original baseline
      // and original candidate intact. Otherwise preserve both byte snapshots.
      const recovery = await readRecovery(recoveryPath);
      if (recovery) {
        const formal = await scanFormalAssets(options);
        const actual = formal.assets.find(({ relativePath }) => relativePath === recovery.targetRelativePath);
        const candidate = (await scanInbox(options)).assets.find(({ relativePath }) => relativePath === input.relativePath);
        const unchanged = recovery.expectedBaselineHash === null
          ? await pathAbsent(join(options.repositoryPath, recovery.targetRelativePath))
          : actual?.contentHash === recovery.expectedBaselineHash;
        if (unchanged && candidate?.contentHash === recovery.expectedContentHash) {
          await removeMatchingStaging(join(options.repositoryPath, ".asset-confirm-staging"), recovery.expectedContentHash);
          await unlink(recoveryPath);
          if (error instanceof AssetConfirmationError) throw error;
        } else {
          throw new AssetConfirmationError("CONFIRM_PARTIAL_WRITE", "Confirmation may be partially applied; recovery bytes retained. Retry only the exact invocation after inspecting file and CURRENT identities");
        }
      } else {
        throw new AssetConfirmationError("CONFIRM_PARTIAL_WRITE", "Finalization failed after content may have been committed; inspect file and CURRENT, then retry the exact invocation");
      }
    }
    throw error;
  } finally {
    versions?.close();
  }
}

function result(input: AssetConfirmationInput, assetId: string, targetRelativePath: string): AssetConfirmationResult {
  return { ok: true, assetId, contentHash: input.expectedContentHash, sourceRelativePath: input.relativePath, targetRelativePath };
}
function sameKind(left: ScannedAsset, right: ScannedAsset): boolean {
  return left.frontmatter.type === right.frontmatter.type && left.frontmatter.scope === right.frontmatter.scope &&
    (left.frontmatter.scope !== "WORKSPACE" || (right.frontmatter.scope === "WORKSPACE" && left.frontmatter.workspace === right.frontmatter.workspace));
}
async function readRecovery(path: string): Promise<Recovery | undefined> {
  try {
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      if (!(await handle.stat()).isFile()) throw new Error("Invalid recovery file");
      return recoverySchema.parse(JSON.parse((await handle.readFile()).toString("utf8")));
    } finally { await handle.close(); }
  } catch (error) {
    if (isCode(error, "ENOENT")) return undefined;
    throw new AssetConfirmationError("CONFIRM_RECOVERY_REQUIRED", "Recovery file is invalid or inaccessible; inspect it locally");
  }
}
function verifyRecoveryBytes(recovery: Recovery): void {
  if (computeContentHash(Buffer.from(recovery.rawContent, "base64")) !== recovery.expectedContentHash ||
      (recovery.expectedBaselineHash !== null && (recovery.baselineContent === null ||
        computeContentHash(Buffer.from(recovery.baselineContent, "base64")) !== recovery.expectedBaselineHash))) {
    throw new AssetConfirmationError("CONFIRM_RECOVERY_REQUIRED", "Recovery byte identity is invalid");
  }
}
async function cleanupCandidate(input: AssetConfirmationInput, options: AssetConfirmationOptions): Promise<void> {
  const scan = await scanInbox(options);
  const candidate = scan.assets.find(({ relativePath }) => relativePath === input.relativePath);
  if (!candidate && await pathAbsent(join(options.repositoryPath, input.relativePath))) return;
  if (candidate?.contentHash !== input.expectedContentHash) {
    throw new AssetConfirmationError("CONFIRM_RECOVERY_REQUIRED", "Candidate changed; it was preserved");
  }
  await (options.fileOperations?.unlink ?? unlink)(join(options.repositoryPath, input.relativePath));
}
async function writeDurableExclusive(path: string, bytes: Buffer): Promise<void> {
  const handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
}
async function syncFile(path: string): Promise<void> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try { await handle.sync(); } finally { await handle.close(); }
}
async function syncDirectory(path: string): Promise<void> { await syncFile(path); }
async function removeMatchingStaging(path: string, hash: string): Promise<void> {
  try {
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      if (!(await handle.stat()).isFile() || computeContentHash(await handle.readFile()) !== hash) {
        throw new AssetConfirmationError("CONFIRM_RECOVERY_REQUIRED", "Unknown staging file was preserved");
      }
    } finally { await handle.close(); }
    await unlink(path);
  } catch (error) { if (!isCode(error, "ENOENT")) throw error; }
}
async function pathAbsent(path: string): Promise<boolean> {
  try { await lstat(path); return false; } catch (error) { if (isCode(error, "ENOENT")) return true; throw error; }
}
function isCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
