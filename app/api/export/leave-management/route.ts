import { NextRequest } from "next/server";
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
    const key = u.paidLeaveId === 0
      ? (latestLeaveByEmpId.get(u.employeeId)?.id ?? 0)
      : u.paidLeaveId;
    const arr = usagesByPaidLeaveId.get(key) ?? [];
    arr.push(u);
    usagesByPaidLeaveId.set(key, arr);
  }

  const BOM = "﻿";
  const header = "社員番号,氏名,配属先,入社日,付与日数,繰越日数,消化日数,残日数,時効日数,取得率";
  const rows = employees.map(emp => {
    const latest = latestLeaveByEmpId.get(emp.id);
    if (!latest) {
      return [
        emp.id, emp.name, emp.assignment, emp.joinDate,
        0, 0, 0, 0, 0, "0%",
      ].join(",");
    }
    const grantedDays = latest.grantedDays;
    const carriedOverDays = latest.carriedOverDays;
    const usgs = usagesByPaidLeaveId.get(latest.id) ?? [];
    const consumedDays = calcConsumedDaysFromUsages(usgs);
    const remaining = Math.max(0, latest.finalRemaining ?? latest.currentRemaining);
    const usageRate = calcUsageRate({ grantedDays, carriedOverDays, consumedDays });
    return [
      emp.id, emp.name, emp.assignment, emp.joinDate,
      grantedDays, carriedOverDays, consumedDays,
      remaining, latest.expiredDays,
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
