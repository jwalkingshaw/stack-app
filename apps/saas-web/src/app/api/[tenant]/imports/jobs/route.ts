import { NextRequest, NextResponse } from "next/server";
import {
  createImportJob,
  listImportJobs,
  resolveImportContext,
  resolveTemplate,
} from "@/lib/product-import-job-service";
import { normalizeImportScope, type ImportIntent, type TemplateSource } from "@/lib/product-imports";

function isIntent(value: unknown): value is ImportIntent {
  return value === "update_only" || value === "create_only" || value === "both";
}

function isTemplateSource(value: unknown): value is TemplateSource {
  return value === "family" || value === "channel";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant } = await params;
    const context = await resolveImportContext(request, tenant);
    const jobs = await listImportJobs(context.organizationId);
    return NextResponse.json({ success: true, data: jobs });
  } catch (error) {
    const status =
      error instanceof Error && error.message === "UNAUTHORIZED"
        ? 401
        : error instanceof Error && error.message === "ACCESS_DENIED"
          ? 403
          : 500;
    return NextResponse.json({ error: "Failed to load import jobs." }, { status });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant } = await params;
    const context = await resolveImportContext(request, tenant);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const intent = body.intent;
    const templateSource = body.template_source;

    if (!isIntent(intent)) {
      return NextResponse.json({ error: "intent must be update_only, create_only, or both." }, { status: 400 });
    }
    if (!isTemplateSource(templateSource)) {
      return NextResponse.json({ error: "template_source must be family or channel." }, { status: 400 });
    }

    const template = await resolveTemplate({
      organizationId: context.organizationId,
      templateSource,
      familyKey: typeof body.family_id === "string" ? body.family_id : null,
      channelKey: typeof body.channel_id === "string" ? body.channel_id : null,
    });

    const job = await createImportJob({
      organizationId: context.organizationId,
      userId: context.userId,
      intent,
      templateSource,
      familyId: template.family?.id || null,
      channelId: template.channel?.id || null,
      scope: normalizeImportScope(body.scope),
      sourceFilename: typeof body.source_filename === "string" ? body.source_filename : null,
    });

    return NextResponse.json({
      success: true,
      data: {
        ...job,
        family: template.family,
        channel: template.channel,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create import job.";
    const status =
      error instanceof Error && error.message === "UNAUTHORIZED"
        ? 401
        : error instanceof Error && error.message === "ACCESS_DENIED"
          ? 403
          : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
