import { NextRequest, NextResponse } from "next/server";
import { ensureDbInitialized } from "@/lib/init-db";
import { storage } from "@/lib/storage";
import { db } from "@/lib/db";
import { leaveUsages } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { calcConsumedDaysFromUsages, calcUsageRate } from "@/lib/leave-calc";

export async function GET(request: NextRequest) {
  await ensureDbInitialized();
  const yearStr = request.nextUrl.searchParams.get("year");
  const year = yearStr ? parseInt(yearStr, 10) : 2025;
  const employees = await storage.getEmployees(false);
  const leaves = await storage.getPaidLeaves();
  const overtimes = await storage.getMonthlyOvertimes(undefined, year);
  const overtimeAlerts = await storage.getOvertimeAlerts(year);
  const leaveAlerts = await storage.getPaidLeaveAlerts();
  const allAlerts = await storage.getAllAlerts(year);

  const activeIds = new Set(employees.map(e => e.id));
  const activeLeaves = leaves.filter(l => activeIds.has(l.employeeId));
  const activeOvertimes = overtimes.filter(o => activeIds.has(o.employeeId));

  const allUsages = await db.select().from(leaveUsages)
    .where(eq(leaveUsages.isVoided, 0));
  const latestLeaveByEmpId = new Map<string, typeof activeLeaves[0]>();
  for (const l of activeLeaves) {
    const existing = latestLeaveByEmpId.get(l.employeeId);
    if (!existing || l.id > existing.id) {
      latestLeaveByEmpId.set(l.employeeId, l);
    }
  }
  const usagesByPaidLeaveId = new Map<number, typeof allUsages>();
  for (const u of allUsages) {
    const key = u.paidLeaveId === 0
      ? (latestLeaveByEmpId.get(u.employeeId)?.id ?? 0)
      : u.paidLeaveId;
    const arr = usagesByPaidLeaveId.get(key) ?? [];
    arr.push(u);
    usagesByPaidLeaveId.set(key, arr);
  }

  const enrichedLeaves = employees
    .filter(emp => latestLeaveByEmpId.has(emp.id))
    .map(emp => {
      const latest = latestLeaveByEmpId.get(emp.id)!;
      const grantedDays = latest.grantedDays;
      const carriedOverDays = latest.carriedOverDays;
      const usgs = usagesByPaidLeaveId.get(latest.id) ?? [];
      const consumedDays = calcConsumedDaysFromUsages(usgs);
      const usageRate = calcUsageRate({ grantedDays, carriedOverDays, consumedDays });
      return { grantedDays, carriedOverDays, consumedDays, usageRate };
    });

  const totalEmployees = employees.length;
  const avgUsageRate = enrichedLeaves.length > 0
    ? enrichedLeaves.reduce((sum, l) => sum + l.usageRate, 0) / enrichedLeaves.length
    : 0;
  const totalConsumed = enrichedLeaves.reduce((sum, l) => sum + l.consumedDays, 0);
  const lowUsageEmployees = enrichedLeaves.filter(l => {
    const total = l.grantedDays + l.carriedOverDays;
    return total > 0 && l.usageRate < 0.1;
  }).length;

  const dangerCount = allAlerts.filter(a => a.severity === "danger").length;
  const warningCount = allAlerts.filter(a => a.severity === "warning").length;

  const monthlyAggregated: { month: number; totalHours: number; avgHours: number; count: number }[] = [];
  for (let m = 1; m <= 12; m++) {
    const monthData = activeOvertimes.filter(o => o.month === m);
    const totalHours = monthData.reduce((s, o) => s + o.overtimeHours, 0);
    monthlyAggregated.push({
      month: m,
      totalHours,
      avgHours: monthData.length > 0 ? totalHours / monthData.length : 0,
      count: monthData.length,
    });
  }

  return NextResponse.json({
    totalEmployees,
    avgUsageRate,
    totalConsumed,
    lowUsageEmployees,
    alertCount: allAlerts.length,
    dangerCount,
    warningCount,
    overtimeAlertCount: overtimeAlerts.length,
    leaveAlertCount: leaveAlerts.length,
    alerts: allAlerts.slice(0, 20),
    monthlyOvertimeAggregated: monthlyAggregated,
  });
}
