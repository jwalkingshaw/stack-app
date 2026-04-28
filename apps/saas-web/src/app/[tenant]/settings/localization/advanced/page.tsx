import { redirect } from 'next/navigation';

interface LocalizationAdvancedPageProps {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ focus?: string }>;
}

export default async function LocalizationAdvancedPage({ params, searchParams }: LocalizationAdvancedPageProps) {
  const { tenant } = await params;
  const resolvedSearchParams = await searchParams;
  const focus = (resolvedSearchParams?.focus || '').trim().toLowerCase();

  if (focus === 'glossaries') {
    redirect(`/${tenant}/settings/localization/glossaries`);
  }
  if (focus === 'jobs') {
    redirect(`/${tenant}/settings/localization/activity`);
  }
  if (focus === 'defaults') {
    redirect(`/${tenant}/settings/localization/defaults`);
  }
  redirect(`/${tenant}/settings/localization`);
}
