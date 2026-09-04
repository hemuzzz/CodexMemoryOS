import Database from "better-sqlite3";

import type { LoadoutAssetMetadata } from "./renderer.js";

interface AssetMetadataRow {
  assetId: string;
  summary: string;
  title: string;
}

export class LoadoutAssetProjectionRepository {
  readonly #database: Database.Database;

  constructor(databasePath: string) {
    this.#database = new Database(databasePath, { fileMustExist: true, readonly: true });
  }

  findMetadata(assetIds: readonly string[]): Map<string, LoadoutAssetMetadata> {
    if (assetIds.length === 0) {
      return new Map();
    }
    const uniqueIds = [...new Set(assetIds)];
    const placeholders = uniqueIds.map(() => "?").join(", ");
    const rows = this.#database
      .prepare<string[], AssetMetadataRow>(`
        SELECT asset_id AS assetId, title, summary
        FROM asset_catalog
        WHERE asset_id IN (${placeholders})
      `)
      .all(...uniqueIds);
    return new Map(rows.map((row) => [row.assetId, row]));
  }

  existingAssetIds(assetIds: readonly string[]): Set<string> {
    return new Set(this.findMetadata(assetIds).keys());
  }

  close(): void {
    if (this.#database.open) {
      this.#database.close();
    }
  }
}
