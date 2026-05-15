import { NextRequest } from "next/server";
import { ensureDbInitialized } from "@/lib/init-db";
import { storage } from "@/lib/storage";
import { db } from "@/lib/db";
import { leaveUsages } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { calcConsumedDaysFromUsages, calcAutoExpiredDays, calcRemainingDays, calcUsageRate } from "@/lib/leave-calc";

export async function GET(request: NextRequest) {
  await ensureDbInitialized();
  const yearStr = request.nextUrl.searchParams.get("year");
  const year = yearStr ? parseInt(yearStr, 10) : 2025;
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

  const BOM = "﻿";
  const header = "社員番号,氏名,配属先,入社日,付与日数,繰越日数,消化日数,残日数,時効日数,取得率";
  const rows = employees.map(emp => {
    const empLeaves = leavesByEmpId.get(emp.id) ?? [];
    if (empLeaves.length === 0) {
      return [
        emp.id, emp.name, emp.assignment, emp.joinDate,
        0, 0, 0, 0, 0, "0%",
      ].join(",");
    }
    const grantedDays = empLeaves.reduce((s, l) => s + l.grantedDays, 0);
    const carriedOverDays = empLeaves.reduce((s, l) => s + l.carriedOverDays, 0);
    const usgs = usagesByEmpId.get(emp.id) ?? [];
    const consumedDays = calcConsumedDaysFromUsages(usgs);
    const autoExpired = calcAutoExpiredDays(carriedOverDays, consumedDays);
    const remaining = calcRemainingDays({
      grantedDays,
      carriedOverDays,
      consumedDays,
      expiredDays: autoExpired,
    });
    const usageRate = calcUsageRate({ grantedDays, carriedOverDays, consumedDays });
    return [
      emp.id, emp.name, emp.assignment, emp.joinDate,
      grantedDays, carriedOverDays, consumedDays,
      Math.max(0, remaining), autoExpired,
      `${(usageRate * 100).toFixed(1)}%`,
    ].join(",");
  });

  return new Response(BOM + header + "\n" + rows.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=leave-management-${year}.csv`,
    },
  });
}
