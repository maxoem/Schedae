import type { MediaStorageAdapter, StoredMediaRecord } from "./types";

const DB_NAME = "schedae-workspace-media";
const DB_VERSION = 1;
const STORE_NAME = "media";

export class InMemoryMediaStorage implements MediaStorageAdapter {
  private readonly records = new Map<string, StoredMediaRecord>();

  async getAll(): Promise<StoredMediaRecord[]> {
    return Array.from(this.records.values()).sort((a, b) => a.createdAt - b.createdAt);
  }

  async get(filename: string): Promise<StoredMediaRecord | undefined> {
    return this.records.get(filename);
  }

  async put(record: StoredMediaRecord): Promise<void> {
    this.records.set(record.filename, record);
  }

  async delete(filename: string): Promise<void> {
    this.records.delete(filename);
  }

  async clear(): Promise<void> {
    this.records.clear();
  }
}

function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function promisifyTransaction(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

export class IndexedDbMediaStorage implements MediaStorageAdapter {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private readonly fallback = new InMemoryMediaStorage();

  private openDb(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const idb = typeof globalThis !== "undefined" ? globalThis.indexedDB : undefined;
      if (!idb) {
        reject(new Error("IndexedDB is not available"));
        return;
      }

      const request = idb.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "filename" });
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          this.dbPromise = null;
        };
        resolve(db);
      };
      request.onerror = () => {
        this.dbPromise = null;
        reject(request.error ?? new Error("Failed to open IndexedDB"));
      };
    });

    return this.dbPromise;
  }

  async getAll(): Promise<StoredMediaRecord[]> {
    try {
      const db = await this.openDb();
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const rows = await promisifyRequest<StoredMediaRecord[]>(store.getAll());
      return rows.sort((a, b) => a.createdAt - b.createdAt);
    } catch {
      return this.fallback.getAll();
    }
  }

  async get(filename: string): Promise<StoredMediaRecord | undefined> {
    try {
      const db = await this.openDb();
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      return await promisifyRequest<StoredMediaRecord | undefined>(store.get(filename));
    } catch {
      return this.fallback.get(filename);
    }
  }

  async put(record: StoredMediaRecord): Promise<void> {
    try {
      const db = await this.openDb();
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(record);
      await promisifyTransaction(tx);
    } catch {
      await this.fallback.put(record);
    }
  }

  async delete(filename: string): Promise<void> {
    try {
      const db = await this.openDb();
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(filename);
      await promisifyTransaction(tx);
    } catch {
      await this.fallback.delete(filename);
    }
  }

  async clear(): Promise<void> {
    try {
      const db = await this.openDb();
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).clear();
      await promisifyTransaction(tx);
    } catch {
      await this.fallback.clear();
    }
  }
}

export function createDefaultMediaStorageAdapter(): MediaStorageAdapter {
  if (typeof globalThis !== "undefined" && typeof globalThis.indexedDB !== "undefined") {
    return new IndexedDbMediaStorage();
  }
  return new InMemoryMediaStorage();
}
