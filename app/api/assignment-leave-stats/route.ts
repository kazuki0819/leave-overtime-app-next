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
  const leaveMap = new Map(leaves.map(l => [l.employeeId, l]));

  const allUsages = await db.select().from(leaveUsages)
    .where(eq(leaveUsages.isVoided, 0));
  const usagesByLeaveId = new Map<number, typeof allUsages>();
  for (const u of allUsages) {
    const arr = usagesByLeaveId.get(u.paidLeaveId) ?? [];
    arr.push(u);
    usagesByLeaveId.set(u.paidLeaveId, arr);
  }

  const assignmentMap = new Map<string, {
    assignment: string; count: number; totalUsageRate: number; totalConsumed: number; under5Count: number;
  }>();

  for (const emp of employees) {
    const assignment = emp.assignment || "-";
    const leave = leaveMap.get(emp.id);
    if (!leave) continue;

    const usgs = usagesByLeaveId.get(leave.id) ?? [];
    const consumedDays = calcConsumedDaysFromUsages(usgs);
    const usageRate = calcUsageRate({ grantedDays: leave.grantedDays, carriedOverDays: leave.carriedOverDays, consumedDays });

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
