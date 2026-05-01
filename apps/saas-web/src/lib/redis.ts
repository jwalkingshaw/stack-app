import { createClient } from 'redis'

export const REDIS_KEY_PREFIX_SAAS = process.env.REDIS_KEY_PREFIX_SAAS || 'saas'

function withPrefix(key: string): string {
  return `${REDIS_KEY_PREFIX_SAAS}:${key}`
}

// Create Redis client with fallback handling for SAAS caching
const redis = process.env.REDIS_URL_SAAS ? createClient({
  url: process.env.REDIS_URL_SAAS,
  socket: {
    connectTimeout: 2000,
    reconnectStrategy: false, // Don't auto-reconnect in serverless
  }
}) : null

// Handle connection errors gracefully
if (redis) {
  redis.on('error', (err) => {
    console.error('SAAS Redis Client Error:', err)
  })
}

// Connect to Redis with fallback
let isConnected = false
let hasWarnedNoRedisConfig = false
let connectionFailed = false // Avoid retrying a broken connection on every request

const timeout = <T>(ms: number, promise: Promise<T>): Promise<T> =>
  Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Redis operation timed out after ${ms}ms`)), ms)
    ),
  ])

const connectRedis = async () => {
  if (!redis) {
    if (!hasWarnedNoRedisConfig) {
      console.warn('SAAS Redis not configured, using in-memory fallback')
      hasWarnedNoRedisConfig = true
    }
    return null
  }

  if (connectionFailed) return null

  if (!isConnected && !redis.isOpen) {
    try {
      await timeout(3000, redis.connect())
      isConnected = true
      console.log('Connected to SAAS Redis Cloud for caching')
    } catch (error) {
      console.error('Failed to connect to SAAS Redis, continuing without cache:', error)
      connectionFailed = true
      return null
    }
  }
  return redis.isOpen ? redis : null
}

// Cache utilities with fallback
class CacheService {
  private inMemoryCache = new Map<string, { value: unknown; expires: number }>()

  async get<T>(key: string): Promise<T | null> {
    try {
      const client = await connectRedis()
      if (client) {
        const value = await timeout(3000, client.get(key))
        return value ? JSON.parse(value) : null
      }
    } catch (error) {
      console.warn('Redis get failed, checking in-memory fallback:', error)
    }

    // Fallback to in-memory cache
    const cached = this.inMemoryCache.get(key)
    if (cached && cached.expires > Date.now()) {
      return cached.value as T
    }
    if (cached && cached.expires <= Date.now()) {
      this.inMemoryCache.delete(key)
    }
    return null
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      const client = await connectRedis()
      if (client) {
        await timeout(3000, client.setEx(key, ttlSeconds, JSON.stringify(value)))
        return
      }
    } catch (error) {
      console.warn('Redis set failed, using in-memory fallback:', error)
    }

    // Fallback to in-memory cache
    this.inMemoryCache.set(key, {
      value,
      expires: Date.now() + (ttlSeconds * 1000)
    })
  }

  /**
   * Atomically increment a counter and set its TTL on first use.
   * Returns the post-increment value.
   * Falls back to the in-memory cache with a non-atomic simulation when Redis is unavailable.
   */
  async incr(key: string, ttlSeconds: number): Promise<number> {
    try {
      const client = await connectRedis()
      if (client) {
        const count = await timeout(3000, client.incr(key))
        if (count === 1) {
          await timeout(3000, client.expire(key, ttlSeconds))
        }
        return count
      }
    } catch (error) {
      console.warn('Redis incr failed, using in-memory fallback:', error)
    }

    // In-memory fallback (not atomic across multiple processes, but fine for dev)
    const now = Date.now()
    const cached = this.inMemoryCache.get(key)
    const existing = cached && cached.expires > now ? (cached.value as number) : 0
    const next = existing + 1
    this.inMemoryCache.set(key, { value: next, expires: now + ttlSeconds * 1000 })
    return next
  }

  async del(key: string): Promise<void> {
    try {
      const client = await connectRedis()
      if (client) {
        await client.del(key)
      }
    } catch (error) {
      console.warn('Redis delete failed:', error)
    }

    // Also clear from in-memory cache
    this.inMemoryCache.delete(key)
  }

  async invalidatePattern(pattern: string): Promise<void> {
    try {
      const client = await connectRedis()
      if (client) {
        const keys = await client.keys(pattern)
        if (keys.length > 0) {
          await client.del(keys)
        }
      }
    } catch (error) {
      console.warn('Redis pattern invalidation failed:', error)
    }

    // Clear matching keys from in-memory cache
    for (const key of this.inMemoryCache.keys()) {
      if (key.includes(pattern.replace('*', ''))) {
        this.inMemoryCache.delete(key)
      }
    }
  }

  // Cleanup expired in-memory entries periodically
  cleanup() {
    const now = Date.now()
    for (const [key, cached] of this.inMemoryCache.entries()) {
      if (cached.expires <= now) {
        this.inMemoryCache.delete(key)
      }
    }
  }
}

export const cache = new CacheService()

// Cache key generators for consistency
export const CacheKeys = {
  user: (userId: string) => withPrefix(`user:${userId}`),
  userSession: (userId: string) => withPrefix(`session:${userId}`),
  organization: (orgId: string) => withPrefix(`org:${orgId}`),
  organizationBySlug: (slug: string) => withPrefix(`org:slug:${slug}`),
  organizationByKindeId: (kindeId: string) => withPrefix(`org:kinde:${kindeId}`),
  organizationMembers: (orgId: string) => withPrefix(`org:${orgId}:members`),
  organizationSlugExists: (slug: string) => withPrefix(`org:slug-exists:${slug}`),
  userWorkspaces: (userId: string) => withPrefix(`user:${userId}:workspaces`),
  products: (orgId: string, page = 1, limit = 50) => withPrefix(`products:${orgId}:${page}:${limit}`),
  productFamilies: (orgId: string) => withPrefix(`families:${orgId}`),
  productById: (productId: string) => withPrefix(`product:${productId}`),
  assets: (orgId: string, folderId?: string) => withPrefix(`assets:${orgId}${folderId ? `:${folderId}` : ''}`),
  assetById: (assetId: string) => withPrefix(`asset:${assetId}`),
  assetPreview: (assetId: string, scopeKey: string) =>
    withPrefix(`asset-preview:${assetId}:${scopeKey}`),
  assetsList: (scopeKey: string) => withPrefix(`assets:list:${scopeKey}`),
  productsList: (scopeKey: string) => withPrefix(`products:list:${scopeKey}`),
  workspaceUnreadCounts: (userId: string, workspaceScope: string) =>
    withPrefix(`workspace-unread:${userId}:${workspaceScope}`),
  apiResponse: (route: string, params: string) => withPrefix(`api:${route}:${params}`),
  userOrgAccess: (userId: string, orgId: string) => withPrefix(`access:${userId}:${orgId}`),
}

// TTL constants (in seconds)
export const CacheTTL = {
  USER_SESSION: 30 * 60,        // 30 minutes - frequently accessed
  ORGANIZATION: 60 * 60,        // 1 hour - relatively stable
  PRODUCTS: 15 * 60,            // 15 minutes - updated frequently in PIM
  PRODUCT_FAMILIES: 60 * 60,    // 1 hour - less frequently changed
  PRODUCT_SINGLE: 10 * 60,      // 10 minutes - single product details
  ASSETS: 10 * 60,              // 10 minutes - asset listings
  ASSET_SINGLE: 30 * 60,        // 30 minutes - single asset details
  ASSET_PREVIEW_SIGNED: 2 * 60, // 2 minutes - short lived signed URL indirection
  ASSET_PREVIEW_FALLBACK: 10 * 60, // 10 minutes - stable CDN/S3 fallback URL
  API_RESPONSE: 5 * 60,         // 5 minutes - general API responses
  USER_ACCESS: 60 * 60,         // 1 hour - organization access permissions
  WORKSPACES: 20,               // 20 seconds - high traffic user nav data
  WORKSPACE_UNREAD: 60,         // 1 minute - workspace rail badge counts
  ORG_EXISTS: 5 * 60,           // 5 minutes - org slug availability checks
  SHORT: 2 * 60,                // 2 minutes - temporary cache
  LONG: 4 * 60 * 60,           // 4 hours - very stable data
}

// Cleanup interval for in-memory cache
if (typeof window === 'undefined') {
  setInterval(() => {
    cache.cleanup()
  }, 5 * 60 * 1000) // Every 5 minutes
}

export { redis, connectRedis }
