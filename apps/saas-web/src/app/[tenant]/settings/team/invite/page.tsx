import { redirect } from "next/navigation";

export default async function InviteTypeChooserPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const resolvedParams = await params;
  redirect(`/${resolvedParams.tenant}/settings/team/invite/team`);
}
