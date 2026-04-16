/**
 * In-memory autocomplete response cache.
 *
 * Provides get/set helpers with TTL-based expiry and size-capped
 * pruning.  The cache is module-level so it is shared across all
 * requests within a single process.
 *
 * @module apps/api/ide/cache
 */

/** A single cached autocomplete entry. */
export interface IAutocompleteCacheEntry {
  completion: string;
  model: string;
  language: string;
  createdAtIso: string;
  /** Absolute timestamp (ms since epoch) after which this entry is stale. */
  expiresAt: number;
}

/** How long autocomplete responses stay cached (ms). */
const AUTOCOMPLETE_CACHE_TTL_MS = Number.parseInt(
  process.env.AUTOCOMPLETE_CACHE_TTL_MS ?? "30000",
  10,
);

/** Maximum number of entries in the autocomplete cache before pruning. */
const AUTOCOMPLETE_CACHE_MAX_ENTRIES = Number.parseInt(
  process.env.AUTOCOMPLETE_CACHE_MAX_ENTRIES ?? "500",
  10,
);

/**
 * The backing store for autocomplete cache entries.
 * Key = composite of language + prefix + suffix (see `buildCacheKey`).
 */
const store = new Map<string, IAutocompleteCacheEntry>();

/**
 * Build a composite cache key for autocomplete responses.
 *
 * The key is a deterministic string derived from the prefix, suffix,
 * and language so that identical requests hit the cache.
 *
 * @param prefix   - Code text before the cursor.
 * @param suffix   - Code text after the cursor.
 * @param language - Programming language identifier.
 * @returns A composite string used as the cache map key.
 */
export function buildCacheKey(prefix: string, suffix: string, language: string): string {
  return `${language}\n---\n${prefix}\n---\n${suffix}`;
}

/**
 * Return a valid (non-expired) cache entry, or `null` if absent/stale.
 *
 * @param key - Cache key produced by `buildCacheKey`.
 * @returns The cached entry, or `null`.
 */
export function getCached(key: string): IAutocompleteCacheEntry | null {
  const entry = store.get(key);
  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }

  return entry;
}

/**
 * Store an autocomplete result in the cache and schedule pruning.
 *
 * @param key   - Cache key produced by `buildCacheKey`.
 * @param value - Entry to store (without `expiresAt` — it is computed here).
 */
export function setCached(
  key: string,
  value: Omit<IAutocompleteCacheEntry, "expiresAt">,
): void {
  store.set(key, {
    ...value,
    expiresAt: Date.now() + AUTOCOMPLETE_CACHE_TTL_MS,
  });
  pruneAutocompleteCache();
}

/**
 * Evict stale and excess entries from the autocomplete cache.
 *
 * 1. Remove all entries whose TTL has expired.
 * 2. If the cache still exceeds `AUTOCOMPLETE_CACHE_MAX_ENTRIES`,
 *    evict the oldest entries (by `expiresAt`) one at a time.
 */
export function pruneAutocompleteCache(): void {
  const now = Date.now();
  for (const [cacheKey, cacheValue] of store.entries()) {
    if (cacheValue.expiresAt <= now) {
      store.delete(cacheKey);
    }
  }

  while (store.size > AUTOCOMPLETE_CACHE_MAX_ENTRIES) {
    let evictionKey: string | null = null;
    let oldestExpiry = Number.POSITIVE_INFINITY;
    for (const [cacheKey, cacheValue] of store.entries()) {
      if (cacheValue.expiresAt < oldestExpiry) {
        oldestExpiry = cacheValue.expiresAt;
        evictionKey = cacheKey;
      }
    }

    if (!evictionKey) {
      break;
    }

    store.delete(evictionKey);
  }
}
