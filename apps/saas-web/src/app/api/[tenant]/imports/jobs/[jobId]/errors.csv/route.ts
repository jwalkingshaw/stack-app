import { NextRequest, NextResponse } from "next/server";
import {
  buildErrorCsv,
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

    const csv = buildErrorCsv(detail.rows);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="import-errors-${jobId}.csv"`,
      },
    });
  } catch (error) {
    const status =
      error instanceof Error && error.message === "UNAUTHORIZED"
        ? 401
        : error instanceof Error && error.message === "ACCESS_DENIED"
          ? 403
          : 500;
    return NextResponse.json({ error: "Failed to export import errors." }, { status });
  }
}
