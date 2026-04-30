import { getSupabaseServer } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";
import {
  getEnvironmentSummary,
  runKindeTests,
  runS3Tests,
  runSupabaseTests,
  type ServiceTestResult,
  validateEnvironmentVariables,
} from "@stack-app/database";

type ServiceName = "supabase" | "kinde" | "s3";

type ServiceBatchResult = {
  service: ServiceName;
  results: ServiceTestResult[];
};

type ServiceResultPayload = {
  service: string;
  status: ServiceTestResult["status"];
  message: string;
  details?: unknown;
};

type ServiceResponseEntry = {
  tested: boolean;
  results?: ServiceResultPayload[];
  skipped?: boolean;
  reason?: string;
};

const TESTABLE_SERVICES: ServiceName[] = ["supabase", "kinde", "s3"];

function parseSkipList(raw: string | null): ServiceName[] {
  if (!raw) return [];
  const values = raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0);

  return values.filter((value): value is ServiceName =>
    TESTABLE_SERVICES.includes(value as ServiceName)
  );
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const includeDetails = searchParams.get("details") === "true";
    const skipTests = parseSkipList(searchParams.get("skip"));

    const envValidation = validateEnvironmentVariables();
    const envSummary = getEnvironmentSummary();

    const testPromises: Promise<ServiceBatchResult>[] = [];
    if (!skipTests.includes("supabase")) {
      testPromises.push(
        runSupabaseTests().then((results) => ({ service: "supabase", results }))
      );
    }
    if (!skipTests.includes("kinde")) {
      testPromises.push(
        runKindeTests().then((results) => ({ service: "kinde", results }))
      );
    }
    if (!skipTests.includes("s3")) {
      testPromises.push(runS3Tests().then((results) => ({ service: "s3", results })));
    }

    const serviceTests = await Promise.all(testPromises);
    const allResults = serviceTests.flatMap((test) => test.results);
    const errorCount = allResults.filter((result) => result.status === "error").length;
    const warningCount = allResults.filter((result) => result.status === "warning").length;
    const successCount = allResults.filter((result) => result.status === "success").length;

    let overallStatus: "healthy" | "degraded" | "unhealthy";
    let statusMessage: string;
    if (errorCount === 0 && warningCount === 0) {
      overallStatus = "healthy";
      statusMessage = "All systems operational";
    } else if (errorCount === 0) {
      overallStatus = "degraded";
      statusMessage = `${warningCount} warning(s) detected`;
    } else {
      overallStatus = "unhealthy";
      statusMessage = `${errorCount} error(s) and ${warningCount} warning(s) detected`;
    }

    const durationMs = Date.now() - startTime;
    const services: Record<string, ServiceResponseEntry> = {};
    for (const test of serviceTests) {
      services[test.service] = {
        tested: true,
        results: test.results.map((result) => ({
          service: result.service,
          status: result.status,
          message: result.message,
          ...(includeDetails && result.details ? { details: result.details } : {}),
        })),
      };
    }

    for (const skipped of skipTests) {
      services[skipped] = {
        tested: false,
        skipped: true,
        reason: "Skipped via query parameter",
      };
    }

    const isInternal =
      searchParams.get("secret") === process.env.HEALTH_CHECK_SECRET &&
      Boolean(process.env.HEALTH_CHECK_SECRET);

    const response = {
      status: overallStatus,
      message: statusMessage,
      timestamp: new Date().toISOString(),
      duration: `${durationMs}ms`,
      summary: {
        total: allResults.length,
        success: successCount,
        warnings: warningCount,
        errors: errorCount,
      },
      ...(isInternal
        ? {
            environment: process.env.NODE_ENV || "development",
            environmentVariables: { validation: envValidation, summary: envSummary },
          }
        : {}),
      services,
    };

    return NextResponse.json(response, {
      status: overallStatus === "unhealthy" ? 503 : 200,
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    console.error("[health-check] Internal error:", error);
    return NextResponse.json(
      {
        status: "unhealthy",
        message: "Health check failed due to internal error",
        timestamp: new Date().toISOString(),
        duration: `${durationMs}ms`,
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      }
    );
  }
}

// Simple health check endpoint for load balancers.
export async function HEAD() {
  try {
    const envValidation = validateEnvironmentVariables();
    return new NextResponse(null, { status: envValidation.isValid ? 200 : 503 });
  } catch {
    return new NextResponse(null, { status: 503 });
  }
}
