import { NextRequest, NextResponse } from "next/server";
import { ensureDbInitialized } from "@/lib/init-db";
import { storage } from "@/lib/storage";
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

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  await ensureDbInitialized();
  const usages = await storage.getLeaveUsages();
  const target = usages.find(u => u.id === parseInt(params.id, 10));
  const ok = await storage.deleteLeaveUsage(parseInt(params.id, 10));
  if (!ok) return NextResponse.json({ message: "データが見つかりません" }, { status: 404 });
  if (target) await recalcConsumedDays(target.employeeId);
  return NextResponse.json({ success: true });
}
