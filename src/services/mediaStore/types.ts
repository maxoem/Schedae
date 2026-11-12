export interface StoredMediaRecord {
  filename: string;
  blob: Blob;
  mimeType: string;
  size: number;
  createdAt: number;
  originalName?: string;
}

export interface WorkspaceMediaItem {
  filename: string;
  localRef: string;
  mimeType: string;
  size: number;
  createdAt: number;
  objectUrl: string;
  originalName?: string;
}

export interface MediaStorageAdapter {
  getAll(): Promise<StoredMediaRecord[]>;
  get(filename: string): Promise<StoredMediaRecord | undefined>;
  put(record: StoredMediaRecord): Promise<void>;
  delete(filename: string): Promise<void>;
  clear(): Promise<void>;
}
