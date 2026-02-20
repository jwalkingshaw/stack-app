import { redirect } from 'next/navigation';

export default async function TeamPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const resolvedParams = await params;
  redirect(`/${resolvedParams.tenant}/settings/team`);
}
