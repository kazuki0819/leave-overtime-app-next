import { NextResponse } from "next/server";
import { ensureDbInitialized } from "@/lib/init-db";
import { storage } from "@/lib/storage";
import { calcAutoExpiredDays } from "@/lib/leave-calc";
import seedData from "@/lib/seed-data.json";

export async function POST() {
  await ensureDbInitialized();
  try {
    const seedVersion = await storage.getMetaValue("seed_version");
    const existingEmployees = await storage.getEmployees(true);

    if (existingEmployees.length > 0 || seedVersion) {
      return NextResponse.json({
        message: `DB already has ${existingEmployees.length} employees (seed_version: ${seedVersion || "none"}) — skipping seed`,
        skipped: true,
      });
    }

    const emps = (seedData as any).employees || [];
    const leaves = (seedData as any).paidLeaves || [];

    if (emps.length > 0) {
      await storage.bulkImportEmployees(emps);
    }
    if (leaves.length > 0) {
      await storage.bulkImportPaidLeaves(leaves);
    }

    // Fix consistency
    const allLeaves = await storage.getPaidLeaves(2025);
    let fixedCount = 0;
    for (const pl of allLeaves) {
      const expectedRemaining = Math.max(0, pl.grantedDays + pl.carriedOverDays - pl.consumedDays - pl.expiredDays);
      const expectedUsageRate = pl.grantedDays > 0 ? pl.consumedDays / pl.grantedDays : 0;
      const remainingOff = Math.abs(pl.remainingDays - expectedRemaining) > 0.001;
      const usageOff = Math.abs(pl.usageRate - expectedUsageRate) > 0.005;
      if (remainingOff || usageOff) {
        await storage.upsertPaidLeave({
          employeeId: pl.employeeId,
          fiscalYear: pl.fiscalYear,
          grantedDays: pl.grantedDays,
          carriedOverDays: pl.carriedOverDays,
          consumedDays: pl.consumedDays,
          remainingDays: expectedRemaining,
          expiredDays: pl.expiredDays,
          usageRate: Math.round(expectedUsageRate * 10000) / 10000,
        });
        fixedCount++;
      }
    }

    // Seed overtime data
    const overtimes = (seedData as any).monthlyOvertimes || [];
    let otCount = 0;
    for (const ot of overtimes) {
      await storage.upsertMonthlyOvertime({
        employeeId: ot.employeeId,
        year: ot.year,
        month: ot.month,
        overtimeHours: ot.overtimeHours,
        lateNightOvertime: ot.lateNightOvertime || 0,
      });
      otCount++;
    }

    // Seed assignment histories
    let ahCount = 0;
    for (const emp of emps) {
      if (!emp.joinDate) continue;
      const assignment = emp.assignment || "-";
      if (assignment !== "-") {
        const joinD = new Date(emp.joinDate);
        const trainEndD = new Date(joinD);
        trainEndD.setMonth(trainEndD.getMonth() + 3);
        const trainEnd = trainEndD.toISOString().split("T")[0];
        await storage.createAssignmentHistory({
          employeeId: emp.id,
          assignment: "-",
          startDate: emp.joinDate,
          endDate: trainEnd,
          note: "入社時研修",
        });
        await storage.createAssignmentHistory({
          employeeId: emp.id,
          assignment: assignment,
          startDate: trainEnd,
          endDate: "",
          note: "初回配属",
        });
        ahCount += 2;
      } else {
        await storage.createAssignmentHistory({
          employeeId: emp.id,
          assignment: "-",
          startDate: emp.joinDate,
          endDate: "",
          note: "本社就業",
        });
        ahCount++;
      }
    }

    await storage.setMetaValue("seed_version", "1.0.0");

    return NextResponse.json({
      message: "Seed complete",
      employees: emps.length,
      paidLeaves: leaves.length,
      overtimes: otCount,
      assignmentHistories: ahCount,
      fixedRecords: fixedCount,
    });
  } catch (e) {
    return NextResponse.json({ message: "Seed failed", error: String(e) }, { status: 500 });
  }
}
