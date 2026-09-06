import { constants } from "node:fs";
import {
  copyFile as copyFileDefault,
  lstat,
  mkdir,
  open,
  rmdir,
  unlink as unlinkDefault,
} from "node:fs/promises";
import { dirname, isAbsolute, join, resolve, win32 } from "node:path";

import {
  computeContentHash,
  scanAssetRepository,
  scanInboxRepository,
  type AssetScanOptions,
  type AssetScanResult,
  type ScannedAsset,
} from "./scanner.js";

import { confirmVersionedInboxAsset } from "./versioned-confirmation.js";

export const CONTENT_HASH_PATTERN = /^[0-9a-f]{64}$/u;

export type AssetConfirmationErrorCode =
  | "CONFIRM_BUSY"
  | "CONFIRM_PARTIAL_WRITE"
  | "CONFIRM_RECOVERY_REQUIRED"
  | "BASELINE_MISMATCH"
  | "UPDATE_ASSET_INVALID"
  | "ASSET_COPY_FAILED"
  | "ASSET_ID_CONFLICT"
  | "CONFIRM_CONFIGURATION_INVALID"
  | "CONFIRM_INPUT_INVALID"
  | "CONTENT_HASH_MISMATCH"
  | "INBOX_ASSET_INVALID"
  | "INBOX_ASSET_NOT_FOUND"
  | "INBOX_SNAPSHOT_UNAVAILABLE"
  | "POST_MOVE_VALIDATION_FAILED"
  | "SOURCE_REMOVE_FAILED"
  | "TARGET_ALREADY_EXISTS";

export interface AssetConfirmationInput {
  updateAssetId?: string;
  expectedBaselineHash?: string;
  expectedContentHash: string;
  relativePath: string;
}

export interface AssetConfirmationResult {
  assetId: string;
  contentHash: string;
  ok: true;
  sourceRelativePath: string;
  targetRelativePath: string;
}

export interface AssetConfirmationFileOperations {
  copyFile: (source: string, target: string, mode: number) => Promise<void>;
  unlink: (path: string) => Promise<void>;
}

export interface AssetConfirmationOptions extends AssetScanOptions {
  databasePath: string;
  checkpoint?: (stage: "prepared" | "file-written" | "database-committed") => Promise<void>;
  fileOperations?: Partial<AssetConfirmationFileOperations>;
}

export class AssetConfirmationError extends Error {
  constructor(
    readonly code: AssetConfirmationErrorCode,
    message: string,
    readonly relativePath?: string,
  ) {
    super(message);
    this.name = "AssetConfirmationError";
  }
}

interface FileIdentity {
  device: number;
  inode: number;
}

interface FileSnapshot extends FileIdentity {
  contentHash: string;
}

const DEFAULT_FILE_OPERATIONS: AssetConfirmationFileOperations = {
  copyFile: copyFileDefault,
  unlink: unlinkDefault,
};

export async function confirmInboxAsset(
  input: AssetConfirmationInput,
  options: AssetConfirmationOptions,
): Promise<AssetConfirmationResult> {
  return confirmVersionedInboxAsset(input, options);
}

// Internal new-file primitive; the public entry always coordinates durable versions.
export async function moveNewInboxAsset(
  input: AssetConfirmationInput,
  options: AssetConfirmationOptions,
): Promise<AssetConfirmationResult> {
  assertConfiguration(options);
  const targetRelativePath = targetPathForInboxPath(input.relativePath);
  assertExpectedContentHash(input.expectedContentHash, input.relativePath);

  const scanOptions = {
    repositoryPath: resolve(options.repositoryPath),
    workspaceConfigPath: resolve(options.workspaceConfigPath),
  };
  const operations = { ...DEFAULT_FILE_OPERATIONS, ...options.fileOperations };
  const initialInboxScan = await scanInbox(scanOptions);
  const selectedAsset = requireEligibleInboxAsset(initialInboxScan, input.relativePath);
  const initialFormalScan = await scanFormalAssets(scanOptions);
  assertNoFormalIdConflict(initialFormalScan, selectedAsset.frontmatter.id, input.relativePath);

  const sourcePath = join(scanOptions.repositoryPath, ...input.relativePath.split("/"));
  const targetPath = join(scanOptions.repositoryPath, ...targetRelativePath.split("/"));
  await assertTargetAbsent(targetPath, targetRelativePath);

  const sourceSnapshot = await readFileSnapshot(
    sourcePath,
    "CONTENT_HASH_MISMATCH",
    "Inbox Asset changed after Scanner validation",
    input.relativePath,
  );
  if (
    selectedAsset.contentHash !== input.expectedContentHash ||
    sourceSnapshot.contentHash !== input.expectedContentHash
  ) {
    throw new AssetConfirmationError(
      "CONTENT_HASH_MISMATCH",
      "Inbox Asset bytes do not match the user-confirmed content hash",
      input.relativePath,
    );
  }

  const createdDirectories = await ensureSafeTargetParent(
    scanOptions.repositoryPath,
    targetRelativePath,
  );
  let copiedTargetIdentity: FileIdentity | undefined;
  let copied = false;

  try {
    try {
      await operations.copyFile(sourcePath, targetPath, constants.COPYFILE_EXCL);
      copied = true;
    } catch (error) {
      if (isFileSystemError(error, "EEXIST")) {
        throw new AssetConfirmationError(
          "TARGET_ALREADY_EXISTS",
          "Formal Asset target already exists; no file was overwritten",
          targetRelativePath,
        );
      }
      throw new AssetConfirmationError(
        "ASSET_COPY_FAILED",
        "Inbox Asset could not be copied to its formal target",
        input.relativePath,
      );
    }

    copiedTargetIdentity = await readFileIdentity(targetPath, targetRelativePath);
    const targetSnapshot = await readFileSnapshot(
      targetPath,
      "POST_MOVE_VALIDATION_FAILED",
      "Copied target is not an accessible regular file",
      targetRelativePath,
    );
    if (
      targetSnapshot.contentHash !== input.expectedContentHash ||
      targetSnapshot.contentHash !== sourceSnapshot.contentHash
    ) {
      throw new AssetConfirmationError(
        "POST_MOVE_VALIDATION_FAILED",
        "Copied target bytes do not match the confirmed Inbox Asset",
        targetRelativePath,
      );
    }

    await requireValidFormalTarget(
      scanOptions,
      selectedAsset.frontmatter.id,
      targetRelativePath,
      input.expectedContentHash,
    );

    const currentInboxScan = await scanInbox(scanOptions);
    const currentSource = requireEligibleInboxAsset(currentInboxScan, input.relativePath);
    const currentSourceSnapshot = await readFileSnapshot(
      sourcePath,
      "CONTENT_HASH_MISMATCH",
      "Inbox Asset changed while confirmation was in progress",
      input.relativePath,
    );
    if (
      currentSource.frontmatter.id !== selectedAsset.frontmatter.id ||
      currentSource.contentHash !== input.expectedContentHash ||
      currentSourceSnapshot.contentHash !== input.expectedContentHash ||
      !sameIdentity(sourceSnapshot, currentSourceSnapshot)
    ) {
      throw new AssetConfirmationError(
        "CONTENT_HASH_MISMATCH",
        "Inbox Asset changed while confirmation was in progress",
        input.relativePath,
      );
    }
  } catch (error) {
    if (copied) {
      await removeCreatedTarget(targetPath, copiedTargetIdentity, operations);
    }
    await removeEmptyCreatedDirectories(createdDirectories);
    throw normalizePostCopyError(error, input.relativePath);
  }

  try {
    await operations.unlink(sourcePath);
  } catch {
    const cleaned = await removeCreatedTarget(targetPath, copiedTargetIdentity, operations);
    if (cleaned) {
      await removeEmptyCreatedDirectories(createdDirectories);
    }
    throw new AssetConfirmationError(
      "SOURCE_REMOVE_FAILED",
      cleaned
        ? "Source removal failed; the uncompleted formal target was removed"
        : "Source removal failed; inspect the reported source and target paths before retrying",
      input.relativePath,
    );
  }

  if (await pathExists(sourcePath)) {
    const cleaned = await removeCreatedTarget(targetPath, copiedTargetIdentity, operations);
    if (cleaned) {
      await removeEmptyCreatedDirectories(createdDirectories);
    }
    throw new AssetConfirmationError(
      "SOURCE_REMOVE_FAILED",
      "Source path still exists after removal; inspect source and target before retrying",
      input.relativePath,
    );
  }

  const finalTargetSnapshot = await readFileSnapshot(
    targetPath,
    "POST_MOVE_VALIDATION_FAILED",
    "Formal Asset target is unavailable after source removal",
    targetRelativePath,
  );
  if (
    finalTargetSnapshot.contentHash !== input.expectedContentHash ||
    finalTargetSnapshot.contentHash !== sourceSnapshot.contentHash ||
    copiedTargetIdentity === undefined ||
    !sameIdentity(copiedTargetIdentity, finalTargetSnapshot)
  ) {
    throw new AssetConfirmationError(
      "POST_MOVE_VALIDATION_FAILED",
      "Formal Asset target changed after source removal",
      targetRelativePath,
    );
  }
  await requireValidFormalTarget(
    scanOptions,
    selectedAsset.frontmatter.id,
    targetRelativePath,
    input.expectedContentHash,
  );

  return {
    ok: true,
    assetId: selectedAsset.frontmatter.id,
    sourceRelativePath: input.relativePath,
    targetRelativePath,
    contentHash: input.expectedContentHash,
  };
}

export function targetPathForInboxPath(relativePath: string): string {
  const parts = safeInboxPathParts(relativePath);
  if (parts === undefined) {
    throw new AssetConfirmationError(
      "CONFIRM_INPUT_INVALID",
      "relativePath must identify one normalized Markdown file in the Inbox layout",
    );
  }
  return ["assets", ...parts.slice(1)].join("/");
}

function safeInboxPathParts(relativePath: string): string[] | undefined {
  if (
    typeof relativePath !== "string" ||
    relativePath.length === 0 ||
    isAbsolute(relativePath) ||
    win32.isAbsolute(relativePath) ||
    relativePath.includes("\\") ||
    relativePath.includes("\0")
  ) {
    return undefined;
  }
  const parts = relativePath.split("/");
  if (parts.some((part) => part.length === 0 || part === "." || part === "..")) {
    return undefined;
  }
  const isGlobal =
    parts.length === 4 &&
    parts[0] === "inbox" &&
    parts[1] === "global" &&
    isTypeDirectory(parts[2]);
  const isWorkspace =
    parts.length === 5 &&
    parts[0] === "inbox" &&
    parts[1] === "workspaces" &&
    parts[2] !== undefined &&
    isTypeDirectory(parts[3]);
  const fileName = parts.at(-1);
  return (isGlobal || isWorkspace) && fileName !== undefined && fileName.toLowerCase().endsWith(".md")
    ? parts
    : undefined;
}

function isTypeDirectory(value: string | undefined): boolean {
  return value === "memories" || value === "documents" || value === "skills";
}

export function assertExpectedContentHash(contentHash: string, relativePath: string): void {
  if (typeof contentHash !== "string" || !CONTENT_HASH_PATTERN.test(contentHash)) {
    throw new AssetConfirmationError(
      "CONFIRM_INPUT_INVALID",
      "expectedContentHash must be a 64-character lowercase SHA-256 value",
      relativePath,
    );
  }
}

export function assertConfiguration(options: AssetScanOptions): void {
  if (
    !isAllowedAbsolutePath(options.repositoryPath) ||
    !isAllowedAbsolutePath(options.workspaceConfigPath)
  ) {
    throw new AssetConfirmationError(
      "CONFIRM_CONFIGURATION_INVALID",
      "Asset Repository and Workspace configuration paths must be absolute",
    );
  }
}

function isAllowedAbsolutePath(path: string): boolean {
  return typeof path === "string" && path.length > 0 && (isAbsolute(path) || win32.isAbsolute(path));
}

export async function scanInbox(options: AssetScanOptions): Promise<AssetScanResult> {
  let result: AssetScanResult;
  try {
    result = await scanInboxRepository(options);
  } catch {
    throw new AssetConfirmationError(
      "INBOX_SNAPSHOT_UNAVAILABLE",
      "Inbox Scanner could not produce a complete snapshot",
    );
  }
  if (!result.isComplete) {
    throw new AssetConfirmationError(
      "INBOX_SNAPSHOT_UNAVAILABLE",
      "Inbox Scanner could not produce a complete snapshot",
    );
  }
  return result;
}

export async function scanFormalAssets(options: AssetScanOptions): Promise<AssetScanResult> {
  let result: AssetScanResult;
  try {
    result = await scanAssetRepository(options);
  } catch {
    throw new AssetConfirmationError(
      "INBOX_SNAPSHOT_UNAVAILABLE",
      "Formal Asset Scanner could not produce a complete snapshot",
    );
  }
  if (!result.isComplete) {
    throw new AssetConfirmationError(
      "INBOX_SNAPSHOT_UNAVAILABLE",
      "Formal Asset Scanner could not produce a complete snapshot",
    );
  }
  return result;
}

export function requireEligibleInboxAsset(scan: AssetScanResult, relativePath: string): ScannedAsset {
  const asset = scan.assets.find((item) => item.relativePath === relativePath);
  if (asset !== undefined) {
    return asset;
  }
  if (scan.diagnostics.some((item) => item.path === relativePath)) {
    throw new AssetConfirmationError(
      "INBOX_ASSET_INVALID",
      "Selected Inbox Asset failed Scanner eligibility validation",
      relativePath,
    );
  }
  throw new AssetConfirmationError(
    "INBOX_ASSET_NOT_FOUND",
    "Selected Inbox Asset was not found",
    relativePath,
  );
}

export function assertNoFormalIdConflict(
  scan: AssetScanResult,
  assetId: string,
  relativePath: string,
): void {
  if (
    scan.assets.some((asset) => asset.frontmatter.id === assetId) ||
    scan.diagnostics.some((item) => item.assetId === assetId)
  ) {
    throw new AssetConfirmationError(
      "ASSET_ID_CONFLICT",
      "Inbox Asset ID conflicts with an existing formal Asset",
      relativePath,
    );
  }
}

async function requireValidFormalTarget(
  options: AssetScanOptions,
  assetId: string,
  targetRelativePath: string,
  expectedContentHash: string,
): Promise<void> {
  const scan = await scanFormalAssets(options);
  if (
    scan.diagnostics.some(
      (item) => item.code === "DUPLICATE_ASSET_ID" && item.assetId === assetId,
    )
  ) {
    throw new AssetConfirmationError(
      "ASSET_ID_CONFLICT",
      "Formal Asset ID became conflicting while confirmation was in progress",
      targetRelativePath,
    );
  }
  const target = scan.assets.find((item) => item.relativePath === targetRelativePath);
  if (
    target === undefined ||
    target.frontmatter.id !== assetId ||
    target.contentHash !== expectedContentHash
  ) {
    throw new AssetConfirmationError(
      "POST_MOVE_VALIDATION_FAILED",
      "Copied target failed formal Asset Scanner validation",
      targetRelativePath,
    );
  }
}

export async function assertTargetAbsent(targetPath: string, targetRelativePath: string): Promise<void> {
  try {
    await lstat(targetPath);
  } catch (error) {
    if (isFileSystemError(error, "ENOENT")) {
      return;
    }
    throw new AssetConfirmationError(
      "ASSET_COPY_FAILED",
      "Formal Asset target could not be inspected",
      targetRelativePath,
    );
  }
  throw new AssetConfirmationError(
    "TARGET_ALREADY_EXISTS",
    "Formal Asset target already exists; no file was overwritten",
    targetRelativePath,
  );
}

async function ensureSafeTargetParent(
  repositoryPath: string,
  targetRelativePath: string,
): Promise<string[]> {
  const parentParts = dirname(targetRelativePath).split("/");
  const createdDirectories: string[] = [];
  let current = repositoryPath;

  for (const part of parentParts) {
    current = join(current, part);
    try {
      await mkdir(current);
      createdDirectories.push(current);
    } catch (error) {
      if (!isFileSystemError(error, "EEXIST")) {
        await removeEmptyCreatedDirectories(createdDirectories);
        throw new AssetConfirmationError(
          "ASSET_COPY_FAILED",
          "Formal Asset parent directory could not be created",
          targetRelativePath,
        );
      }
    }

    try {
      const stats = await lstat(current);
      if (stats.isSymbolicLink() || !stats.isDirectory()) {
        throw new Error("unsafe target parent");
      }
    } catch {
      await removeEmptyCreatedDirectories(createdDirectories);
      throw new AssetConfirmationError(
        "ASSET_COPY_FAILED",
        "Formal Asset parent path must contain only regular directories",
        targetRelativePath,
      );
    }
  }
  return createdDirectories;
}

async function readFileIdentity(path: string, relativePath: string): Promise<FileIdentity> {
  try {
    const stats = await lstat(path);
    if (stats.isSymbolicLink() || !stats.isFile()) {
      throw new Error("not a regular file");
    }
    return { device: stats.dev, inode: stats.ino };
  } catch {
    throw new AssetConfirmationError(
      "POST_MOVE_VALIDATION_FAILED",
      "Copied target is not a regular file",
      relativePath,
    );
  }
}

async function readFileSnapshot(
  path: string,
  code: "CONTENT_HASH_MISMATCH" | "POST_MOVE_VALIDATION_FAILED",
  message: string,
  relativePath: string,
): Promise<FileSnapshot> {
  try {
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const before = await handle.stat();
      if (!before.isFile()) {
        throw new Error("not a regular file");
      }
      const bytes = await handle.readFile();
      const after = await handle.stat();
      if (!after.isFile() || !sameIdentity(toIdentity(before), toIdentity(after))) {
        throw new Error("file changed during read");
      }
      return {
        ...toIdentity(after),
        contentHash: computeContentHash(bytes),
      };
    } finally {
      await handle.close();
    }
  } catch {
    throw new AssetConfirmationError(code, message, relativePath);
  }
}

function toIdentity(stats: { dev: number; ino: number }): FileIdentity {
  return { device: stats.dev, inode: stats.ino };
}

function sameIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return left.device === right.device && left.inode === right.inode;
}

async function removeCreatedTarget(
  targetPath: string,
  identity: FileIdentity | undefined,
  operations: AssetConfirmationFileOperations,
): Promise<boolean> {
  if (identity === undefined) {
    return !(await pathExists(targetPath));
  }
  try {
    const current = await lstat(targetPath);
    if (!current.isFile() || !sameIdentity(identity, toIdentity(current))) {
      return false;
    }
    await operations.unlink(targetPath);
    return !(await pathExists(targetPath));
  } catch (error) {
    return isFileSystemError(error, "ENOENT");
  }
}

async function removeEmptyCreatedDirectories(paths: readonly string[]): Promise<void> {
  for (const path of [...paths].reverse()) {
    try {
      await rmdir(path);
    } catch {
      // A non-empty or externally changed directory is not owned exclusively by this command.
    }
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (isFileSystemError(error, "ENOENT")) {
      return false;
    }
    return true;
  }
}

function normalizePostCopyError(error: unknown, relativePath: string): AssetConfirmationError {
  if (error instanceof AssetConfirmationError) {
    return error;
  }
  return new AssetConfirmationError(
    "POST_MOVE_VALIDATION_FAILED",
    "Copied target could not be validated safely",
    relativePath,
  );
}

function isFileSystemError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
