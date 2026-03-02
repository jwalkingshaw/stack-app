import BillingSettings from '../components/BillingSettings';

export default async function BillingPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams?: Promise<{ source?: string }>;
}) {
  const { tenant } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const source = resolvedSearchParams?.source;
  return <BillingSettings tenantSlug={tenant} source={source} />;
}
