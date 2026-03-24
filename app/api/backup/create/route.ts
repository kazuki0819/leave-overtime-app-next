import { NextResponse } from "next/server";
import { ensureDbInitialized } from "@/lib/init-db";
import { storage } from "@/lib/storage";

export async function POST() {
  await ensureDbInitialized();
  try {
    // Export all data as JSON backup
    const employees = await storage.getEmployees(true);
    const leaves = await storage.getPaidLeaves();
    const overtimes = await storage.getMonthlyOvertimes();
    const usages = await storage.getLeaveUsages();

    const backup = {
      timestamp: new Date().toISOString(),
      employees,
      paidLeaves: leaves,
      monthlyOvertimes: overtimes,
      leaveUsages: usages,
    };

    return NextResponse.json({
      success: true,
      filename: `backup-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`,
      size: JSON.stringify(backup).length,
      timestamp: new Date().toISOString(),
      data: backup,
    });
  } catch (e) {
    return NextResponse.json({ message: "バックアップに失敗しました", error: String(e) }, { status: 500 });
  }
}
