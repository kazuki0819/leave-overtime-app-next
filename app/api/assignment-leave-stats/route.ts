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
  // v28発覚バグの修正: employeeId ベースで集約（複数サイクル + orphan対応）
  const leavesByEmpId: Map<string, typeof leaves> = new Map();
  for (const l of leaves) {
    const arr = leavesByEmpId.get(l.employeeId) ?? [];
    arr.push(l);
    leavesByEmpId.set(l.employeeId, arr);
  }

  const allUsages = await db.select().from(leaveUsages)
    .where(eq(leaveUsages.isVoided, 0));
  const usagesByEmpId: Map<string, typeof allUsages> = new Map();
  for (const u of allUsages) {
    const arr = usagesByEmpId.get(u.employeeId) ?? [];
    arr.push(u);
    usagesByEmpId.set(u.employeeId, arr);
  }

  const assignmentMap = new Map<string, {
    assignment: string; count: number; totalUsageRate: number; totalConsumed: number; under5Count: number;
  }>();

  for (const emp of employees) {
    const assignment = emp.assignment || "-";
    const empLeaves = leavesByEmpId.get(emp.id) ?? [];
    if (empLeaves.length === 0) continue;
    const grantedDays = empLeaves.reduce((s, l) => s + l.grantedDays, 0);
    const carriedOverDays = empLeaves.reduce((s, l) => s + l.carriedOverDays, 0);

    const usgs = usagesByEmpId.get(emp.id) ?? [];
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
