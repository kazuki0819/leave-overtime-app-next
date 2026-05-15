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
  const leaveMap = new Map(leaves.map(l => [l.employeeId, l]));

  const allUsages = await db.select().from(leaveUsages)
    .where(eq(leaveUsages.isVoided, 0));
  const usagesByLeaveId = new Map<number, typeof allUsages>();
  for (const u of allUsages) {
    const arr = usagesByLeaveId.get(u.paidLeaveId) ?? [];
    arr.push(u);
    usagesByLeaveId.set(u.paidLeaveId, arr);
  }

  const BOM = "﻿";
  const header = "社員番号,氏名,配属先,入社日,付与日数,繰越日数,消化日数,残日数,時効日数,取得率";
  const rows = employees.map(emp => {
    const l = leaveMap.get(emp.id);
    if (!l) {
      return [
        emp.id, emp.name, emp.assignment, emp.joinDate,
        0, 0, 0, 0, 0, "0%",
      ].join(",");
    }
    const usgs = usagesByLeaveId.get(l.id) ?? [];
    const consumedDays = calcConsumedDaysFromUsages(usgs);
    const autoExpired = calcAutoExpiredDays(l.carriedOverDays, consumedDays);
    const remaining = calcRemainingDays({
      grantedDays: l.grantedDays,
      carriedOverDays: l.carriedOverDays,
      consumedDays,
      expiredDays: autoExpired,
    });
    const usageRate = calcUsageRate({ grantedDays: l.grantedDays, carriedOverDays: l.carriedOverDays, consumedDays });
    return [
      emp.id, emp.name, emp.assignment, emp.joinDate,
      l.grantedDays, l.carriedOverDays, consumedDays,
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
