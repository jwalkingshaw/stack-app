import { redirect } from "next/navigation";

interface FoldersPageProps {
  params: Promise<{ tenant: string }>
}

export default async function FoldersPage({ params }: FoldersPageProps) {
  const resolvedParams = await params
  const tenantSlug = resolvedParams.tenant

  redirect(`/${tenantSlug}/assets`);
}
