"use client";

import { useParams } from "next/navigation";
import RoadMapClient from "./RoadMapClient";

export default function RoadMapPage() {
  const params = useParams();
  const tenantSlug = params.tenant as string;

  return (
    <>
      <RoadMapClient tenantSlug={tenantSlug} />
    </>
  );
}