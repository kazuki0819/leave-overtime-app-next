import { storage } from "@/lib/storage";
import { calcAutoExpiredDays } from "@/lib/leave-calc";

export async function recalcConsumedDays(employeeId: string) {
  const usages = await storage.getLeaveUsages(employeeId);
  const autoConsumed = usages.reduce((sum, u) => sum + u.days, 0);
  const leave = await storage.getPaidLeaveByEmployee(employeeId);
  if (leave) {
    const adjustment = leave.adjustmentDays;
    const consumed = autoConsumed + adjustment;
    const expired = calcAutoExpiredDays(leave.carriedOverDays, consumed);
    const remaining = Math.max(0, leave.grantedDays + leave.carriedOverDays - consumed - expired);
    const usageRate = leave.grantedDays > 0 ? consumed / leave.grantedDays : 0;
    await storage.upsertPaidLeave({
      employeeId,
      fiscalYear: leave.fiscalYear,
      grantedDays: leave.grantedDays,
      carriedOverDays: leave.carriedOverDays,
      consumedDays: consumed,
      remainingDays: remaining,
      expiredDays: expired,
      usageRate: Math.round(usageRate * 10000) / 10000,
    });
  }
}
