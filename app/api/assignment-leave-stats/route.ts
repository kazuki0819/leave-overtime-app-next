import { NextRequest, NextResponse } from "next/server";
import { ensureDbInitialized } from "@/lib/init-db";
import { storage } from "@/lib/storage";

export async function GET(request: NextRequest) {
  await ensureDbInitialized();
  const yearStr = request.nextUrl.searchParams.get("year");
  const year = yearStr ? parseInt(yearStr, 10) : 2025;
  const employees = await storage.getEmployees(false);
  const leaves = await storage.getPaidLeaves(year);
  const leaveMap = new Map(leaves.map(l => [l.employeeId, l]));

  const assignmentMap = new Map<string, {
    assignment: string; count: number; totalUsageRate: number; totalConsumed: number; under5Count: number;
  }>();

  for (const emp of employees) {
    const assignment = emp.assignment || "-";
    const leave = leaveMap.get(emp.id);
    if (!leave) continue;
    let stats = assignmentMap.get(assignment);
    if (!stats) {
      stats = { assignment, count: 0, totalUsageRate: 0, totalConsumed: 0, under5Count: 0 };
      assignmentMap.set(assignment, stats);
    }
    stats.count++;
    stats.totalUsageRate += leave.usageRate;
    stats.totalConsumed += leave.consumedDays;
    if (leave.consumedDays < 5) stats.under5Count++;
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
