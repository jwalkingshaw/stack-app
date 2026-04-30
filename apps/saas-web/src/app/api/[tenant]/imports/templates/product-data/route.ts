import { NextRequest, NextResponse } from "next/server";
import {
  buildTemplateDownload,
  resolveImportContext,
  resolveTemplate,
} from "@/lib/product-import-job-service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant } = await params;
    const context = await resolveImportContext(request, tenant);
    const url = new URL(request.url);
    const family = url.searchParams.get("family");
    const channel = url.searchParams.get("channel");
    const format = (url.searchParams.get("format") || "csv").toLowerCase();
    const templateSource = channel ? "channel" : "family";

    const template = await resolveTemplate({
      organizationId: context.organizationId,
      templateSource,
      familyKey: family,
      channelKey: channel,
    });
    const download = buildTemplateDownload(template.fields);

    if (format === "json") {
      return NextResponse.json({
        success: true,
        data: {
          templateSource,
          family: template.family,
          channel: template.channel,
          columns: download.columns,
        },
      });
    }

    const fileBits = [
      "product-data",
      templateSource,
      template.family?.code || null,
      template.channel?.code || null,
      Date.now().toString(),
    ].filter(Boolean);

    return new NextResponse(download.csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileBits.join("-")}.csv"`,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error && error.message !== "ACCESS_DENIED" && error.message !== "UNAUTHORIZED"
        ? error.message
        : "Failed to generate import template.";
    const status =
      error instanceof Error && error.message === "UNAUTHORIZED"
        ? 401
        : error instanceof Error && error.message === "ACCESS_DENIED"
          ? 403
          : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
