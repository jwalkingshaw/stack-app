"use client";

import { useParams } from "next/navigation";
import { UpdateDetailClient } from "./UpdateDetailClient";

export default function UpdateDetailPage() {
  const params = useParams();
  const tenantSlug = params.tenant as string;
  const updateId = params.updateId as string;

  return <UpdateDetailClient tenantSlug={tenantSlug} updateId={updateId} />;
}
