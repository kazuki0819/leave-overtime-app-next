import { NextRequest, NextResponse } from "next/server";
import { ensureDbInitialized } from "@/lib/init-db";
import { storage } from "@/lib/storage";

// Diff detection: compare Excel data vs DB values, return differences
export async function POST(request: NextRequest) {
  await ensureDbInitialized();
  try {
    const body = await request.json();
    const { employees: excelEmps, paidLeaves: excelLeaves, overtimes: excelOTs } = body;

    const diffs: {
      employeeId: string;
      employeeName: string;
      category: "employee" | "paidLeave" | "overtime";
      field: string;
      fieldLabel: string;
      dbValue: string | number | null;
      excelValue: string | number | null;
      month?: number; // for overtime
      isNew: boolean; // true if record doesn't exist in DB
      isProtected: boolean; // true if field is auto-calculated
    }[] = [];

    const newRecords: {
      employeeId: string;
      employeeName: string;
      category: "employee" | "paidLeave" | "overtime";
      summary: string;
    }[] = [];

    // ── Employee diffs ──
    if (excelEmps && Array.isArray(excelEmps)) {
      for (const excelEmp of excelEmps) {
        if (!excelEmp.id || !excelEmp.name) continue;
        const dbEmp = await storage.getEmployee(String(excelEmp.id));
        if (!dbEmp) {
          newRecords.push({
            employeeId: String(excelEmp.id),
            employeeName: excelEmp.name,
            category: "employee",
            summary: `新規社員: ${excelEmp.name}（${excelEmp.assignment || "-"}）`,
          });
          continue;
        }
        const empFields: { key: string; label: string; dbVal: any; exVal: any }[] = [
          { key: "name", label: "氏名", dbVal: dbEmp.name, exVal: excelEmp.name },
          { key: "assignment", label: "配属先", dbVal: dbEmp.assignment, exVal: excelEmp.assignment },
          { key: "joinDate", label: "入社日", dbVal: dbEmp.joinDate, exVal: excelEmp.joinDate },
        ];
        for (const f of empFields) {
          if (f.exVal && f.exVal !== "" && String(f.dbVal) !== String(f.exVal)) {
            diffs.push({
              employeeId: String(excelEmp.id),
              employeeName: dbEmp.name,
              category: "employee",
              field: f.key,
              fieldLabel: f.label,
              dbValue: f.dbVal,
              excelValue: f.exVal,
              isNew: false,
              isProtected: false,
            });
          }
        }
      }
    }

    // ── Paid Leave diffs ──
    if (excelLeaves && Array.isArray(excelLeaves)) {
      for (const excelLeave of excelLeaves) {
        if (!excelLeave.employeeId) continue;
        const fy = excelLeave.fiscalYear ?? 2025;
        const dbLeave = await storage.getPaidLeaveByEmployee(excelLeave.employeeId, fy);
        const emp = await storage.getEmployee(excelLeave.employeeId);
        const empName = emp?.name ?? `社員${excelLeave.employeeId}`;

        // Check if this employee has leave usages (auto-calc protection)
        const usages = await storage.getLeaveUsages(excelLeave.employeeId);
        const hasUsages = usages.length > 0;

        if (!dbLeave) {
          newRecords.push({
            employeeId: excelLeave.employeeId,
            employeeName: empName,
            category: "paidLeave",
            summary: `新規有給データ: 付与${excelLeave.grantedDays ?? 0}日 / 消化${excelLeave.consumedDays ?? 0}日`,
          });
          continue;
        }
        const leaveFields: { key: string; label: string; dbVal: number; exVal: number | undefined; protected: boolean }[] = [
          { key: "grantedDays", label: "付与日数", dbVal: dbLeave.grantedDays, exVal: excelLeave.grantedDays, protected: false },
          { key: "carriedOverDays", label: "繰越日数", dbVal: dbLeave.carriedOverDays, exVal: excelLeave.carriedOverDays, protected: false },
          { key: "consumedDays", label: "消化日数", dbVal: dbLeave.consumedDays, exVal: excelLeave.consumedDays, protected: hasUsages },
          { key: "remainingDays", label: "残日数", dbVal: dbLeave.remainingDays, exVal: excelLeave.remainingDays, protected: hasUsages },
          { key: "expiredDays", label: "失効日数", dbVal: dbLeave.expiredDays, exVal: excelLeave.expiredDays, protected: false },
          { key: "usageRate", label: "取得率", dbVal: dbLeave.usageRate, exVal: excelLeave.usageRate, protected: hasUsages },
        ];
        for (const f of leaveFields) {
          if (f.exVal !== undefined && f.exVal !== null && Number(f.dbVal) !== Number(f.exVal)) {
            diffs.push({
              employeeId: excelLeave.employeeId,
              employeeName: empName,
              category: "paidLeave",
              field: f.key,
              fieldLabel: f.label,
              dbValue: f.dbVal,
              excelValue: f.exVal,
              isNew: false,
              isProtected: f.protected,
            });
          }
        }
      }
    }

    // ── Overtime diffs ──
    if (excelOTs && Array.isArray(excelOTs)) {
      for (const excelOT of excelOTs) {
        if (!excelOT.employeeId || !excelOT.month) continue;
        const year = excelOT.year ?? 2025;
        const allOT = await storage.getMonthlyOvertimes(excelOT.employeeId, year);
        const dbOT = allOT.find(o => o.month === excelOT.month);
        const emp = await storage.getEmployee(excelOT.employeeId);
        const empName = emp?.name ?? `社員${excelOT.employeeId}`;

        if (!dbOT) {
          newRecords.push({
            employeeId: excelOT.employeeId,
            employeeName: empName,
            category: "overtime",
            summary: `新規残業データ: ${excelOT.month}月 ${excelOT.overtimeHours ?? 0}h`,
          });
          continue;
        }
        const otFields: { key: string; label: string; dbVal: number; exVal: number | undefined }[] = [
          { key: "overtimeHours", label: `${excelOT.month}月 残業時間`, dbVal: dbOT.overtimeHours, exVal: excelOT.overtimeHours },
          { key: "lateNightOvertime", label: `${excelOT.month}月 深夜残業`, dbVal: dbOT.lateNightOvertime, exVal: excelOT.lateNightOvertime },
        ];
        for (const f of otFields) {
          if (f.exVal !== undefined && f.exVal !== null && Number(f.dbVal) !== Number(f.exVal)) {
            diffs.push({
              employeeId: excelOT.employeeId,
              employeeName: empName,
              category: "overtime",
              field: f.key,
              fieldLabel: f.label,
              dbValue: f.dbVal,
              excelValue: f.exVal,
              month: excelOT.month,
              isNew: false,
              isProtected: false,
            });
          }
        }
      }
    }

    return NextResponse.json({
      diffs,
      newRecords,
      summary: {
        totalDiffs: diffs.length,
        protectedDiffs: diffs.filter(d => d.isProtected).length,
        newEmployees: newRecords.filter(r => r.category === "employee").length,
        newPaidLeaves: newRecords.filter(r => r.category === "paidLeave").length,
        newOvertimes: newRecords.filter(r => r.category === "overtime").length,
      },
    });
  } catch (e) {
    return NextResponse.json({ message: "差分検出に失敗しました", error: String(e) }, { status: 400 });
  }
}
