import { NextRequest, NextResponse } from "next/server";
import { ensureDbInitialized } from "@/lib/init-db";
import { storage } from "@/lib/storage";
import { insertLeaveUsageSchema } from "@/lib/schema";
import { calcAutoExpiredDays } from "@/lib/leave-calc";

async function recalcConsumedDays(employeeId: string) {
  const usages = await storage.getLeaveUsages(employeeId);
  const totalConsumed = usages.reduce((sum, u) => sum + u.days, 0);
  const leave = await storage.getPaidLeaveByEmployee(employeeId);
  if (leave) {
    const expired = calcAutoExpiredDays(leave.carriedOverDays, totalConsumed);
    const remaining = Math.max(0, leave.grantedDays + leave.carriedOverDays - totalConsumed - expired);
    const usageRate = leave.grantedDays > 0 ? totalConsumed / leave.grantedDays : 0;
    await storage.upsertPaidLeave({
      employeeId,
      fiscalYear: leave.fiscalYear,
      grantedDays: leave.grantedDays,
      carriedOverDays: leave.carriedOverDays,
      consumedDays: totalConsumed,
      remainingDays: remaining,
      expiredDays: expired,
      usageRate: Math.round(usageRate * 10000) / 10000,
    });
  }
}

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
