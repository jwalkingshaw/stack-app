import { redirect } from "next/navigation";

export default async function UploadPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;
  redirect(`/${tenant}/assets`);
}
