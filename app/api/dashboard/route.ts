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
  // v28発覚バグの修正: employeeId 単位で集約（複数サイクル対応・orphan救済）
  const leavesByEmpId: Map<string, typeof activeLeaves> = new Map();
  for (const l of activeLeaves) {
    const arr = leavesByEmpId.get(l.employeeId) ?? [];
    arr.push(l);
    leavesByEmpId.set(l.employeeId, arr);
  }
  const usagesByEmpId: Map<string, typeof allUsages> = new Map();
  for (const u of allUsages) {
    const arr = usagesByEmpId.get(u.employeeId) ?? [];
    arr.push(u);
    usagesByEmpId.set(u.employeeId, arr);
  }

  const enrichedLeaves = employees
    .filter(emp => (leavesByEmpId.get(emp.id) ?? []).length > 0)
    .map(emp => {
      const empLeaves = leavesByEmpId.get(emp.id)!;
      const grantedDays = empLeaves.reduce((s, l) => s + l.grantedDays, 0);
      const carriedOverDays = empLeaves.reduce((s, l) => s + l.carriedOverDays, 0);
      const usgs = usagesByEmpId.get(emp.id) ?? [];
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
