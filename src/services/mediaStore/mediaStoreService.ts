import { createDefaultMediaStorageAdapter } from "./indexedDbAdapter";
import {
  createMediaFilename,
  hashBlobShort,
  inferImageMimeType,
  toLocalMediaRef,
} from "./mediaUtils";
import type { MediaStorageAdapter, StoredMediaRecord, WorkspaceMediaItem } from "./types";

export class MediaStoreService {
  private readonly adapter: MediaStorageAdapter;
  private readonly objectUrls = new Map<string, string>();

  constructor(adapter: MediaStorageAdapter = createDefaultMediaStorageAdapter()) {
    this.adapter = adapter;
  }

  private getOrCreateObjectUrl(filename: string, blob: Blob): string {
    const existing = this.objectUrls.get(filename);
    if (existing) return existing;

    if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
      const created = URL.createObjectURL(blob);
      this.objectUrls.set(filename, created);
      return created;
    }
    return toLocalMediaRef(filename);
  }

  private revokeObjectUrl(filename: string): void {
    const existing = this.objectUrls.get(filename);
    if (!existing) return;
    if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function" && existing.startsWith("blob:")) {
      URL.revokeObjectURL(existing);
    }
    this.objectUrls.delete(filename);
  }

  private toWorkspaceItem(record: StoredMediaRecord): WorkspaceMediaItem {
    return {
      filename: record.filename,
      localRef: toLocalMediaRef(record.filename),
      mimeType: record.mimeType,
      size: record.size,
      createdAt: record.createdAt,
      objectUrl: this.getOrCreateObjectUrl(record.filename, record.blob),
      originalName: record.originalName,
    };
  }

  async rehydrate(): Promise<WorkspaceMediaItem[]> {
    const records = await this.adapter.getAll();
    return records.map((r) => this.toWorkspaceItem(r));
  }

  async storeImageFile(file: Blob, originalName?: string): Promise<WorkspaceMediaItem> {
    const name = originalName ?? (file instanceof File ? file.name : undefined);
    const mimeType = inferImageMimeType({ type: file.type, name: name ?? "" });
    const hash = await hashBlobShort(file);
    const filename = createMediaFilename(hash, mimeType);

    const existing = await this.adapter.get(filename);
    if (existing) {
      return this.toWorkspaceItem(existing);
    }

    const normalizedBlob = file.type === mimeType ? file : file.slice(0, file.size, mimeType);
    const record: StoredMediaRecord = {
      filename,
      blob: normalizedBlob,
      mimeType,
      size: normalizedBlob.size,
      createdAt: Date.now(),
      ...(name ? { originalName: name } : {}),
    };

    await this.adapter.put(record);
    return this.toWorkspaceItem(record);
  }

  async deleteMedia(filename: string): Promise<void> {
    this.revokeObjectUrl(filename);
    await this.adapter.delete(filename);
  }

  async getExportPayloads(filenames: Set<string>): Promise<Array<{ filename: string; data: Blob }>> {
    if (filenames.size === 0) return [];
    const payloads: Array<{ filename: string; data: Blob }> = [];
    for (const filename of filenames) {
      const record = await this.adapter.get(filename);
      if (record) {
        payloads.push({ filename: record.filename, data: record.blob });
      }
    }
    return payloads;
  }

  async pruneUnreferenced(referencedFilenames: Set<string>): Promise<string[]> {
    const records = await this.adapter.getAll();
    const removed: string[] = [];
    for (const record of records) {
      if (!referencedFilenames.has(record.filename)) {
        this.revokeObjectUrl(record.filename);
        await this.adapter.delete(record.filename);
        removed.push(record.filename);
      }
    }
    return removed;
  }

  disposeObjectUrls(): void {
    for (const filename of Array.from(this.objectUrls.keys())) {
      this.revokeObjectUrl(filename);
    }
  }
}

export const defaultMediaStoreService = new MediaStoreService();
