"use client";

import { useParams } from "next/navigation";
import { UpdatesClient } from "./UpdatesClient";

export default function UpdatesPage() {
  const params = useParams();
  const tenantSlug = params.tenant as string;

  return <UpdatesClient tenantSlug={tenantSlug} />;
}
