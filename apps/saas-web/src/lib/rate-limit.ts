import { NextRequest, NextResponse } from "next/server";
import { connectRedis } from "./redis";

type RateLimitCheck = {
  key: string;
  windowSeconds: number;
  maxRequests: number;
};

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

const memoryBuckets = new Map<string, { count: number; resetAt: number }>();

function getClientIp(request: NextRequest): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    return xff.split(",")[0]?.trim() || "unknown";
  }
  return request.headers.get("x-real-ip") || "unknown";
}

async function checkInRedis({
  key,
  windowSeconds,
  maxRequests,
}: RateLimitCheck): Promise<RateLimitResult | null> {
  try {
    const redis = await connectRedis();
    if (!redis) return null;

    const hits = await redis.incr(key);
    if (hits === 1) {
      await redis.expire(key, windowSeconds);
    }

    const ttl = await redis.ttl(key);
    const retryAfterSeconds = ttl > 0 ? ttl : windowSeconds;
    const remaining = Math.max(0, maxRequests - hits);

    return {
      allowed: hits <= maxRequests,
      remaining,
      retryAfterSeconds,
    };
  } catch {
    return null;
  }
}

function checkInMemory({
  key,
  windowSeconds,
  maxRequests,
}: RateLimitCheck): RateLimitResult {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const existing = memoryBuckets.get(key);

  if (!existing || existing.resetAt <= now) {
    memoryBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return {
      allowed: true,
      remaining: maxRequests - 1,
      retryAfterSeconds: windowSeconds,
    };
  }

  existing.count += 1;
  memoryBuckets.set(key, existing);

  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((existing.resetAt - now) / 1000)
  );

  return {
    allowed: existing.count <= maxRequests,
    remaining: Math.max(0, maxRequests - existing.count),
    retryAfterSeconds,
  };
}

export async function enforceRateLimit(
  request: NextRequest,
  config: {
    action: string;
    tenant?: string;
    token?: string;
    userId?: string;
    windowSeconds: number;
    maxRequests: number;
  }
): Promise<RateLimitResult> {
  const ip = getClientIp(request);
  const keyParts = [
    "rl",
    config.action,
    config.tenant || "global",
    config.userId || "anon",
    ip,
    config.token || "none",
  ];
  const key = keyParts.join(":");

  const redisResult = await checkInRedis({
    key,
    windowSeconds: config.windowSeconds,
    maxRequests: config.maxRequests,
  });

  if (redisResult) {
    return redisResult;
  }

  return checkInMemory({
    key,
    windowSeconds: config.windowSeconds,
    maxRequests: config.maxRequests,
  });
}

export function rateLimitExceededResponse(result: RateLimitResult): NextResponse {
  return NextResponse.json(
    { error: "Too many requests. Please try again shortly." },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfterSeconds),
        "X-RateLimit-Remaining": String(result.remaining),
      },
    }
  );
}
