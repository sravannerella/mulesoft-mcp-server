export type CacheEntry<T> = {
  value: T;
  cachedAt: string;
};

export class MemoryCache<T> {
  private entries = new Map<string, CacheEntry<T>>();

  get(key: string): CacheEntry<T> | undefined {
    return this.entries.get(key);
  }

  set(key: string, value: T): CacheEntry<T> {
    const entry = {
      value,
      cachedAt: new Date().toISOString(),
    };

    this.entries.set(key, entry);
    return entry;
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }
}
