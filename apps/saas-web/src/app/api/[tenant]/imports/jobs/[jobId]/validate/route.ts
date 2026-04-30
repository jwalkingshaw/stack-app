import { NextRequest, NextResponse } from "next/server";
import {
  getImportJob,
  resolveImportContext,
  validateImportJob,
} from "@/lib/product-import-job-service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; jobId: string }> }
) {
  try {
    const { tenant, jobId } = await params;
    const context = await resolveImportContext(request, tenant);
    const job = await getImportJob(context.organizationId, jobId);
    if (!job) {
      return NextResponse.json({ error: "Import job not found." }, { status: 404 });
    }

    const summary = await validateImportJob(job);
    return NextResponse.json({ success: true, data: summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to validate import job.";
    const status =
      error instanceof Error && error.message === "UNAUTHORIZED"
        ? 401
        : error instanceof Error && error.message === "ACCESS_DENIED"
          ? 403
          : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
