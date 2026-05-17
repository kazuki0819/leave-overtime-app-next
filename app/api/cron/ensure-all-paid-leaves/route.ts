import { NextRequest, NextResponse } from "next/server";
import { ensureDbInitialized } from "@/lib/init-db";
import { ensurePaidLeavesUpToDate, formatISODate } from "@/lib/paid-leave-calc";
import { db } from "@/lib/db";
import { employees, paidLeaves } from "@/lib/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureDbInitialized();

  const allEmployees = await db.select().from(employees);
  const activeEmployees = allEmployees.filter(
    (e) => e.status === "active" || e.status === null
  );

  const allPaidLeaves = await db.select().from(paidLeaves);
  const latestByEmployee = new Map<string, (typeof allPaidLeaves)[number]>();
  for (const pl of allPaidLeaves) {
    const existing = latestByEmployee.get(pl.employeeId);
    if (!existing || pl.id > existing.id) {
      latestByEmployee.set(pl.employeeId, pl);
    }
  }

  const today = new Date();
  const todayStr = formatISODate(today);
  let generated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const emp of activeEmployees) {
    try {
      const latest = latestByEmployee.get(emp.id);
      const needsGeneration =
        !latest || latest.cycleEndDate < todayStr;

      await ensurePaidLeavesUpToDate(emp.id, today);

      if (needsGeneration && emp.joinDate && emp.joinDate !== "") {
        generated++;
      } else {
        skipped++;
      }
    } catch (e) {
      errors.push(`${emp.id}(${emp.name}): ${String(e)}`);
    }
  }

  const summary = {
    success: errors.length === 0,
    totalEmployees: activeEmployees.length,
    generated,
    skipped,
    errors,
    executedAt: today.toISOString(),
  };

  console.log("[Cron] ensure-all-paid-leaves:", JSON.stringify(summary));

  return NextResponse.json(summary);
}
