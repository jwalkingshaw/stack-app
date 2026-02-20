import { createClient } from 'redis'

// Create Redis client with fallback handling for SAAS caching
const redis = process.env.REDIS_URL_SAAS ? createClient({
  url: process.env.REDIS_URL_SAAS,
  socket: {
    connectTimeout: 5000,
  }
}) : null

// Handle connection errors gracefully
if (redis) {
  redis.on('error', (err) => {
    console.error('SAAS Redis Client Error:', err)
    // Don't crash the process, just log the error
  })
}

// Connect to Redis with fallback
let isConnected = false

const connectRedis = async () => {
  if (!redis) {
    console.warn('SAAS Redis not configured, using in-memory fallback')
    return null
  }

  if (!isConnected && !redis.isOpen) {
    try {
      await redis.connect()
      isConnected = true
      console.log('Connected to SAAS Redis Cloud for caching')
    } catch (error) {
      console.error('Failed to connect to SAAS Redis, continuing without cache:', error)
      return null
    }
  }
  return redis
}

// Cache utilities with fallback
class CacheService {
  private inMemoryCache = new Map<string, { value: any; expires: number }>()

  async get<T>(key: string): Promise<T | null> {
    try {
      const client = await connectRedis()
      if (client) {
        const value = await client.get(key)
        return value ? JSON.parse(value) : null
      }
    } catch (error) {
      console.warn('Redis get failed, checking in-memory fallback:', error)
    }

    // Fallback to in-memory cache
    const cached = this.inMemoryCache.get(key)
    if (cached && cached.expires > Date.now()) {
      return cached.value
    }
    if (cached && cached.expires <= Date.now()) {
      this.inMemoryCache.delete(key)
    }
    return null
  }

  async set(key: string, value: any, ttlSeconds: number): Promise<void> {
    try {
      const client = await connectRedis()
      if (client) {
        await client.setEx(key, ttlSeconds, JSON.stringify(value))
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
  user: (userId: string) => `user:${userId}`,
  userSession: (userId: string) => `session:${userId}`,
  organization: (orgId: string) => `org:${orgId}`,
  organizationBySlug: (slug: string) => `org:slug:${slug}`,
  organizationByKindeId: (kindeId: string) => `org:kinde:${kindeId}`,
  organizationMembers: (orgId: string) => `org:${orgId}:members`,
  products: (orgId: string, page = 1, limit = 50) => `products:${orgId}:${page}:${limit}`,
  productFamilies: (orgId: string) => `families:${orgId}`,
  productById: (productId: string) => `product:${productId}`,
  assets: (orgId: string, folderId?: string) => `assets:${orgId}${folderId ? `:${folderId}` : ''}`,
  assetById: (assetId: string) => `asset:${assetId}`,
  apiResponse: (route: string, params: string) => `api:${route}:${params}`,
  userOrgAccess: (userId: string, orgId: string) => `access:${userId}:${orgId}`,
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
  API_RESPONSE: 5 * 60,         // 5 minutes - general API responses
  USER_ACCESS: 60 * 60,         // 1 hour - organization access permissions
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