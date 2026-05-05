import { storage } from "./storage";
import { calcAutoExpiredDays } from "./leave-calc";
import { db } from "./db";
import { leaveUsages, paidLeaves } from "./schema";
import { eq, and } from "drizzle-orm";

export async function recalcConsumedDays(employeeId: string) {
  const leave = await storage.getPaidLeaveByEmployee(employeeId);
  if (!leave) return;

  const usages = await db.select().from(leaveUsages)
    .where(and(
      eq(leaveUsages.paidLeaveId, leave.id),
      eq(leaveUsages.isVoided, 0),
    ));

  const totalConsumed = usages.reduce((sum, u) => sum + u.days, 0);
  const expired = calcAutoExpiredDays(leave.carriedOverDays, totalConsumed);
  const remaining = Math.max(0, leave.grantedDays + leave.carriedOverDays - totalConsumed - expired);
  const usageRate = leave.grantedDays > 0 ? totalConsumed / leave.grantedDays : 0;

  await storage.upsertPaidLeave({
    employeeId,
    fiscalYear: leave.fiscalYear,
    grantedDays: leave.grantedDays,
    carriedOverDays: leave.carriedOverDays,
    remainingDays: remaining,
    expiredDays: expired,
    usageRate: Math.round(usageRate * 10000) / 10000,
  });

  // consumed_days を派生値として更新（アラート計算等で参照されるため）
  await db.update(paidLeaves)
    .set({ consumedDays: totalConsumed })
    .where(eq(paidLeaves.id, leave.id));
}
