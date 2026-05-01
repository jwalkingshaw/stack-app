import BillingSettings from '../components/BillingSettings';

export default async function BillingPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams?: Promise<{ source?: string; plan_intent?: string }>;
}) {
  const { tenant } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const source = resolvedSearchParams?.source;
  const planIntent = resolvedSearchParams?.plan_intent;
  return <BillingSettings tenantSlug={tenant} source={source} planIntent={planIntent} />;
}
