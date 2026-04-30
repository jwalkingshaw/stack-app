function normalizeCloudFrontDomain(value: string | null | undefined): string | null {
  if (!value) return null
  const normalized = value.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "")
  return normalized.length > 0 ? normalized.toLowerCase() : null
}

const configuredCloudFrontDomain = normalizeCloudFrontDomain(process.env.AWS_CLOUDFRONT_DOMAIN)

export function rewriteStorageUrlToCloudFront(url: string | null | undefined): string | null {
  const candidate = typeof url === "string" ? url.trim() : ""
  if (!candidate) return null
  if (!configuredCloudFrontDomain) return candidate

  try {
    const parsed = new URL(candidate)
    if (!parsed.hostname.toLowerCase().endsWith("amazonaws.com")) {
      return candidate
    }
    const path = parsed.pathname.replace(/^\/+/, "")
    return path ? `https://${configuredCloudFrontDomain}/${path}` : candidate
  } catch {
    return candidate
  }
}

export function buildCloudFrontUrlFromKey(s3Key: string | null | undefined): string | null {
  if (!configuredCloudFrontDomain || typeof s3Key !== "string") return null
  const path = s3Key.trim().replace(/^\/+/, "")
  return path ? `https://${configuredCloudFrontDomain}/${path}` : null
}

export function resolveStorageDeliveryUrl(params: {
  s3Key?: string | null | undefined
  s3Url?: string | null | undefined
}): string | null {
  return buildCloudFrontUrlFromKey(params.s3Key) || rewriteStorageUrlToCloudFront(params.s3Url)
}

export function rewriteThumbnailUrls(
  value: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value ?? null
  const rewritten: Record<string, unknown> = {}
  for (const [key, current] of Object.entries(value)) {
    rewritten[key] =
      typeof current === "string" ? rewriteStorageUrlToCloudFront(current) : current
  }
  return rewritten
}

