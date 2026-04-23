import { NextRequest, NextResponse } from "next/server";
import { ensureDbInitialized } from "@/lib/init-db";
import { storage } from "@/lib/storage";
import { insertLeaveUsageSchema } from "@/lib/schema";
import { recalcConsumedDays } from "@/lib/recalc-consumed";

export async function GET(request: NextRequest) {
  await ensureDbInitialized();
  const employeeId = request.nextUrl.searchParams.get("employeeId") || undefined;
  const usages = await storage.getLeaveUsages(employeeId);
  return NextResponse.json(usages);
}

export async function POST(request: NextRequest) {
  await ensureDbInitialized();
  try {
    const body = await request.json();
    const data = insertLeaveUsageSchema.parse(body) as any;
    const usage = await storage.createLeaveUsage(data);
    await recalcConsumedDays(data.employeeId);
    return NextResponse.json(usage, { status: 201 });
  } catch (e) {
    return NextResponse.json({ message: "入力データが不正です", error: String(e) }, { status: 400 });
  }
}
