import { NextRequest, NextResponse } from "next/server";
import { ensureDbInitialized } from "@/lib/init-db";
import { storage } from "@/lib/storage";
import { calcAutoGrantedDays, calcAutoCarryoverDays } from "@/lib/leave-calc";

export async function GET(request: NextRequest) {
  await ensureDbInitialized();
  try {
    const yearStr = request.nextUrl.searchParams.get("year");
    const targetFiscalYear = yearStr ? parseInt(yearStr, 10) : 0;
    if (!targetFiscalYear) {
      return NextResponse.json({ message: "year パラメータが必要です" }, { status: 400 });
    }

    const prevYear = targetFiscalYear - 1;
    const employees = await storage.getEmployees(false);
    const prevLeaves = await storage.getPaidLeaves(prevYear);
    const existingNewLeaves = await storage.getPaidLeaves(targetFiscalYear);
    const prevLeaveMap = new Map(prevLeaves.map(l => [l.employeeId, l]));
    const existingNewMap = new Map(existingNewLeaves.map(l => [l.employeeId, l]));

    const preview = employees.map(emp => {
      const prevLeave = prevLeaveMap.get(emp.id);
      const alreadyExists = existingNewMap.has(emp.id);
      const grantedDays = calcAutoGrantedDays(emp.joinDate, targetFiscalYear);
      const carryoverDays = calcAutoCarryoverDays(prevLeave?.remainingDays);

      return {
        employeeId: emp.id, name: emp.name, joinDate: emp.joinDate,
        prevGranted: prevLeave?.grantedDays ?? 0,
        prevConsumed: prevLeave?.consumedDays ?? 0,
        prevRemaining: prevLeave?.remainingDays ?? 0,
        newGranted: grantedDays, newCarryover: carryoverDays,
        newTotal: grantedDays + carryoverDays,
        alreadyExists,
      };
    });

    return NextResponse.json({
      targetFiscalYear, previousFiscalYear: prevYear,
      totalEmployees: employees.length,
      alreadyTransitioned: preview.filter(p => p.alreadyExists).length,
      toBeCreated: preview.filter(p => !p.alreadyExists).length,
      employees: preview,
    });
  } catch (e) {
    return NextResponse.json({ message: "プレビュー取得に失敗しました", error: String(e) }, { status: 400 });
  }
}
