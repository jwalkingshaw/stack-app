import SyndicationClient from './SyndicationClient'

interface SyndicationPageProps {
  params: Promise<{ tenant: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function normalizeProductIds(rawValue: string | string[] | undefined): string[] {
  const raw = Array.isArray(rawValue) ? rawValue.join(',') : rawValue || ''
  return Array.from(
    new Set(
      raw
        .split(',')
        .map((value) => value.trim())
        .filter((value) => UUID_PATTERN.test(value))
    )
  )
}

export default async function SyndicationPage({
  params,
  searchParams,
}: SyndicationPageProps) {
  const resolvedParams = await params
  const resolvedSearch = searchParams ? await searchParams : {}
  const initialProductIds = normalizeProductIds(resolvedSearch.products)
  const initialProfileId = (() => {
    const raw = Array.isArray(resolvedSearch.profileId)
      ? resolvedSearch.profileId[0]
      : resolvedSearch.profileId
    return typeof raw === 'string' && UUID_PATTERN.test(raw) ? raw : null
  })()

  return (
    <SyndicationClient
      tenantSlug={resolvedParams.tenant}
      initialProductIds={initialProductIds}
      initialProfileId={initialProfileId}
    />
  )
}
