import { NextRequest, NextResponse } from "next/server";
import { ensureDbInitialized } from "@/lib/init-db";
import { storage } from "@/lib/storage";
import { calcAutoGrantedDays, calcAutoCarryoverDays } from "@/lib/leave-calc";

export async function POST(request: NextRequest) {
  await ensureDbInitialized();
  try {
    const body = await request.json();
    const { targetFiscalYear } = body;
    if (!targetFiscalYear || typeof targetFiscalYear !== "number") {
      return NextResponse.json({ message: "targetFiscalYear（数値）が必要です" }, { status: 400 });
    }

    const prevYear = targetFiscalYear - 1;
    const employees = await storage.getEmployees(false);
    const prevLeaves = await storage.getPaidLeaves(prevYear);
    const existingNewLeaves = await storage.getPaidLeaves(targetFiscalYear);
    const prevLeaveMap = new Map(prevLeaves.map(l => [l.employeeId, l]));
    const existingNewMap = new Map(existingNewLeaves.map(l => [l.employeeId, l]));

    let created = 0;
    let skipped = 0;
    const details: { employeeId: string; name: string; granted: number; carryover: number; status: string }[] = [];

    for (const emp of employees) {
      if (existingNewMap.has(emp.id)) {
        skipped++;
        details.push({
          employeeId: emp.id, name: emp.name,
          granted: existingNewMap.get(emp.id)!.grantedDays,
          carryover: existingNewMap.get(emp.id)!.carriedOverDays,
          status: "既存（スキップ）",
        });
        continue;
      }

      const grantedDays = calcAutoGrantedDays(emp.joinDate, targetFiscalYear);
      const prevLeave = prevLeaveMap.get(emp.id);
      const carryoverDays = calcAutoCarryoverDays(prevLeave?.remainingDays);
      const remaining = grantedDays + carryoverDays;

      await storage.upsertPaidLeave({
        employeeId: emp.id,
        fiscalYear: targetFiscalYear,
        grantedDays,
        carriedOverDays: carryoverDays,
        consumedDays: 0,
        remainingDays: remaining,
        expiredDays: 0,
        usageRate: 0,
      });

      created++;
      details.push({
        employeeId: emp.id, name: emp.name,
        granted: grantedDays, carryover: carryoverDays,
        status: "新規作成",
      });
    }

    return NextResponse.json({
      targetFiscalYear,
      previousFiscalYear: prevYear,
      totalEmployees: employees.length,
      created, skipped, details,
    });
  } catch (e) {
    return NextResponse.json({ message: "年度切替に失敗しました", error: String(e) }, { status: 400 });
  }
}
