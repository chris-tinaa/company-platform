type CacheEntry = { address: string | null; expiresAt: number };

export class ReverseGeocoder {
  private readonly fetcher: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly clock: () => number;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly pending = new Map<string, Promise<string | null>>();
  private queue: Promise<void> = Promise.resolve();
  private lastRequestAt = Number.NEGATIVE_INFINITY;

  constructor(
    fetcher: typeof fetch = globalThis.fetch,
    sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    clock: () => number = Date.now,
  ) {
    this.fetcher = fetcher;
    this.sleep = sleep;
    this.clock = clock;
  }

  async reverse(latitude: number, longitude: number): Promise<string | null> {
    if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 ||
        !Number.isFinite(longitude) || Math.abs(longitude) > 180) {
      throw new RangeError('Koordinat lokasi tidak valid');
    }
    if (process.env.GEOCODER_ENABLED === 'false') return null;
    const key = `${latitude.toFixed(6)},${longitude.toFixed(6)}`;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > this.clock()) return cached.address;
    const existing = this.pending.get(key);
    if (existing) return existing;
    if (this.pending.size >= 8) return null;

    const request = this.queue.then(async () => {
      const elapsed = this.clock() - this.lastRequestAt;
      if (elapsed < 1000) await this.sleep(1000 - elapsed);
      this.lastRequestAt = this.clock();
      const address = await this.lookup(latitude, longitude);
      this.cache.set(key, { address, expiresAt: this.clock() + (address ? 600_000 : 30_000) });
      if (this.cache.size > 250) {
        const oldest = this.cache.keys().next().value;
        if (oldest) this.cache.delete(oldest);
      }
      return address;
    });
    this.pending.set(key, request);
    this.queue = request.then(() => undefined, () => undefined);
    try {
      return await request;
    } finally {
      this.pending.delete(key);
    }
  }

  private async lookup(latitude: number, longitude: number): Promise<string | null> {
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('lat', String(latitude));
    url.searchParams.set('lon', String(longitude));
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('accept-language', 'id');
    url.searchParams.set('zoom', '18');
    try {
      const response = await this.fetcher(url.toString(), {
        headers: {
          'User-Agent': process.env.GEOCODER_USER_AGENT?.trim() || 'CompanyPlatformWFHDemo/1.0',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(4500),
      });
      if (!response.ok) return null;
      const payload: unknown = await response.json();
      if (!payload || typeof payload !== 'object' || !('display_name' in payload) ||
          typeof payload.display_name !== 'string') return null;
      const address = payload.display_name.replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g, ' ').trim();
      return address ? address.slice(0, 700) : null;
    } catch {
      return null;
    }
  }
}
