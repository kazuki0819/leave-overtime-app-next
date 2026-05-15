import { NextResponse } from "next/server";
import { ensureDbInitialized } from "@/lib/init-db";
import { storage } from "@/lib/storage";
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
    });
  } catch (e) {
    return NextResponse.json({ message: "Seed failed", error: String(e) }, { status: 500 });
  }
}
