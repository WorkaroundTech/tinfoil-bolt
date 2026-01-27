export type ShopData = {
  files: Array<{ url: string; size: number }>;
  directories: string[];
};

export class ShopDataCache {
  private data: ShopData | null = null;
  private timestamp: number = 0;
  private ttlMs: number;

  constructor(ttlSeconds: number) {
    this.ttlMs = ttlSeconds * 1000;
  }

  set(data: ShopData): void {
    this.data = data;
    this.timestamp = Date.now();
  }

  get(): ShopData | null {
    if (!this.data) return null;
    const now = Date.now();
    if (now - this.timestamp > this.ttlMs) {
      this.data = null;
      this.timestamp = 0;
      return null;
    }
    return this.data;
  }

  isValid(): boolean {
    return this.get() !== null;
  }

  reset(): void {
    this.data = null;
    this.timestamp = 0;
  }
}
