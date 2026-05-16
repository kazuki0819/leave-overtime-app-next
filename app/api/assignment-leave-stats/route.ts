import { NextRequest, NextResponse } from "next/server";
import { ensureDbInitialized } from "@/lib/init-db";
import { storage } from "@/lib/storage";
import { db } from "@/lib/db";
import { leaveUsages } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { calcConsumedDaysFromUsages, calcUsageRate } from "@/lib/leave-calc";

export async function GET(request: NextRequest) {
  await ensureDbInitialized();
  const employees = await storage.getEmployees(false);
  const leaves = await storage.getPaidLeaves();
  const latestLeaveByEmpId = new Map<string, typeof leaves[0]>();
  for (const l of leaves) {
    const existing = latestLeaveByEmpId.get(l.employeeId);
    if (!existing || l.id > existing.id) {
      latestLeaveByEmpId.set(l.employeeId, l);
    }
  }

  const allUsages = await db.select().from(leaveUsages)
    .where(eq(leaveUsages.isVoided, 0));
  const usagesByPaidLeaveId = new Map<number, typeof allUsages>();
  for (const u of allUsages) {
    const arr = usagesByPaidLeaveId.get(u.paidLeaveId) ?? [];
    arr.push(u);
    usagesByPaidLeaveId.set(u.paidLeaveId, arr);
  }

  const assignmentMap = new Map<string, {
    assignment: string; count: number; totalUsageRate: number; totalConsumed: number; under5Count: number;
  }>();

  for (const emp of employees) {
    const assignment = emp.assignment || "-";
    const latest = latestLeaveByEmpId.get(emp.id);
    if (!latest) continue;
    const grantedDays = latest.grantedDays;
    const carriedOverDays = latest.carriedOverDays;

    const usgs = usagesByPaidLeaveId.get(latest.id) ?? [];
    const consumedDays = calcConsumedDaysFromUsages(usgs);
    const usageRate = calcUsageRate({ grantedDays, carriedOverDays, consumedDays });

    let stats = assignmentMap.get(assignment);
    if (!stats) {
      stats = { assignment, count: 0, totalUsageRate: 0, totalConsumed: 0, under5Count: 0 };
      assignmentMap.set(assignment, stats);
    }
    stats.count++;
    stats.totalUsageRate += usageRate;
    stats.totalConsumed += consumedDays;
    if (consumedDays < 5) stats.under5Count++;
  }

  const result = Array.from(assignmentMap.values())
    .map(s => ({
      assignment: s.assignment,
      employeeCount: s.count,
      avgUsageRate: Math.round((s.totalUsageRate / s.count) * 1000) / 1000,
      totalConsumed: s.totalConsumed,
      under5Count: s.under5Count,
    }))
    .sort((a, b) => a.avgUsageRate - b.avgUsageRate);

  return NextResponse.json(result);
}
