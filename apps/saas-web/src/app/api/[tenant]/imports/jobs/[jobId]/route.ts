import { NextRequest, NextResponse } from "next/server";
import {
  getImportJobDetail,
  resolveImportContext,
} from "@/lib/product-import-job-service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; jobId: string }> }
) {
  try {
    const { tenant, jobId } = await params;
    const context = await resolveImportContext(request, tenant);
    const detail = await getImportJobDetail(context.organizationId, jobId);
    if (!detail.job) {
      return NextResponse.json({ error: "Import job not found." }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        job: detail.job,
        rows: detail.rows.slice(0, 100),
      },
    });
  } catch (error) {
    const status =
      error instanceof Error && error.message === "UNAUTHORIZED"
        ? 401
        : error instanceof Error && error.message === "ACCESS_DENIED"
          ? 403
          : 500;
    return NextResponse.json({ error: "Failed to load import job." }, { status });
  }
}
