import { storage } from "./storage";
import { calcAutoExpiredDays } from "./leave-calc";

export async function recalcConsumedDays(employeeId: string) {
  const usages = await storage.getLeaveUsages(employeeId);

  // leave_usagesが0件なら何もしない
  // 本番運用ではleave_usagesが空のまま、consumed_daysは
  // paid_leavesに直接手入力されるため、0で上書きしてはならない
  if (usages.length === 0) {
    return;
  }

  const totalConsumed = usages.reduce((sum, u) => sum + u.days, 0);
  const leave = await storage.getPaidLeaveByEmployee(employeeId);
  if (!leave) return;

  const expired = calcAutoExpiredDays(leave.carriedOverDays, totalConsumed);
  const usageRate = leave.grantedDays > 0 ? totalConsumed / leave.grantedDays : 0;

  let remaining: number;
  if (leave.manualBaselineDate != null && leave.manualBaselineRemaining != null) {
    const usedAfter = usages
      .filter((u) => u.startDate > leave.manualBaselineDate!)
      .reduce((sum, u) => sum + u.days, 0);
    remaining = Math.max(0, leave.manualBaselineRemaining - usedAfter);
  } else {
    remaining = Math.max(0, leave.grantedDays + leave.carriedOverDays - totalConsumed - expired);
  }

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
