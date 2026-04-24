import { NextRequest, NextResponse } from "next/server";
import { ensureDbInitialized } from "@/lib/init-db";
import { storage } from "@/lib/storage";
import { insertPaidLeaveSchema } from "@/lib/schema";
import { recalcConsumedDays } from "@/lib/recalc-consumed";

export async function GET(request: NextRequest) {
  await ensureDbInitialized();
  const yearStr = request.nextUrl.searchParams.get("year");
  const year = yearStr ? parseInt(yearStr, 10) : undefined;
  const leaves = await storage.getPaidLeaves(year);
  return NextResponse.json(leaves);
}

export async function PUT(request: NextRequest) {
  await ensureDbInitialized();
  try {
    const body = await request.json();
    const data = insertPaidLeaveSchema.parse(body) as any;

    const hasDate = data.manualBaselineDate !== undefined && data.manualBaselineDate !== null;
    const hasRemaining = data.manualBaselineRemaining !== undefined && data.manualBaselineRemaining !== null;
    if (hasDate !== hasRemaining) {
      return NextResponse.json(
        { message: "manual_baseline_date と manual_baseline_remaining はセットで指定してください" },
        { status: 400 },
      );
    }

    const granted = data.grantedDays ?? 0;
    const carriedOver = data.carriedOverDays ?? 0;
    const consumed = data.consumedDays ?? 0;
    const expired = data.expiredDays ?? 0;
    data.remainingDays = Math.max(0, granted + carriedOver - consumed - expired);
    data.usageRate = granted > 0 ? Math.round((consumed / granted) * 10000) / 10000 : 0;
    const leave = await storage.upsertPaidLeave(data);

    await recalcConsumedDays(data.employeeId);
    const updated = await storage.getPaidLeaveByEmployee(data.employeeId, data.fiscalYear);

    return NextResponse.json(updated ?? leave);
  } catch (e) {
    return NextResponse.json({ message: "入力データが不正です", error: String(e) }, { status: 400 });
  }
}
