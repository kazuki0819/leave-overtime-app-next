import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ensureDbInitialized } from "@/lib/init-db";
import { db } from "@/lib/db";
import { employees, paidLeaves, assignmentHistories, leaveUsages } from "@/lib/schema";
import { eq, and, lte, gte, or, like } from "drizzle-orm";
import { calcAllGrantDates, isGrantedInMonth, calcConsumedDaysFromUsages, calcAutoExpiredDays, calcRemainingDays } from "@/lib/leave-calc";

const querySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

function formatDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function getAssignmentAtDate(employeeId: string, dateStr: string): Promise<string> {
  const rows = await db
    .select({ assignment: assignmentHistories.assignment })
    .from(assignmentHistories)
    .where(
      and(
        eq(assignmentHistories.employeeId, employeeId),
        lte(assignmentHistories.startDate, dateStr),
        or(
          eq(assignmentHistories.endDate, ""),
          gte(assignmentHistories.endDate, dateStr),
        ),
      ),
    )
    .limit(1);
  return rows[0]?.assignment ?? "-";
}

export async function GET(request: NextRequest) {
  await ensureDbInitialized();

  const parsed = querySchema.safeParse({
    year: request.nextUrl.searchParams.get("year"),
    month: request.nextUrl.searchParams.get("month"),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map(i => i.message).join(", ") },
      { status: 400 },
    );
  }

  const { year, month } = parsed.data;
  const ym = `${year}-${String(month).padStart(2, "0")}`;

  try {
    const allEmployees = await db.select().from(employees);

    const allUsages = await db.select().from(leaveUsages)
      .where(eq(leaveUsages.isVoided, 0));
    const usagesByLeaveId = new Map<number, typeof allUsages>();
    for (const u of allUsages) {
      const arr = usagesByLeaveId.get(u.paidLeaveId) ?? [];
      arr.push(u);
      usagesByLeaveId.set(u.paidLeaveId, arr);
    }

    const result: Array<{
      id: string;
      name: string;
      assignment: string;
      isRetired: boolean;
      retiredDate: string | null;
      grantDate: string;
      grantedDays: number;
      carriedOverDays: number;
      consumedDays: number;
      remainingDays: number;
      expiredDays: number;
      usageRate: number;
      achieved5Days: boolean;
    }> = [];

    for (const emp of allEmployees) {
      if (!emp.joinDate) continue;
      if (!isGrantedInMonth(emp.joinDate, year, month)) continue;

      const grants = calcAllGrantDates(emp.joinDate, new Date(year, month - 1 + 1, 0));
      const grantDate = grants.find(
        d => d.getFullYear() === year && d.getMonth() + 1 === month,
      );
      if (!grantDate) continue;

      const grantDateStr = formatDateStr(grantDate);

      if (emp.status === "retired") {
        if (emp.retiredDate && emp.retiredDate < grantDateStr) continue;
      }

      const leaveRows = await db
        .select()
        .from(paidLeaves)
        .where(
          and(
            eq(paidLeaves.employeeId, emp.id),
            like(paidLeaves.cycleStartDate, `${ym}%`),
          ),
        )
        .limit(1);
      const leave = leaveRows[0];
      if (!leave) {
        console.warn(
          `[grant-cycle-review] paid_leaves not found: employee_id=${emp.id}`,
        );
        continue;
      }

      const assignment = await getAssignmentAtDate(emp.id, grantDateStr);

      const usgs = usagesByLeaveId.get(leave.id) ?? [];
      const consumedDays = calcConsumedDaysFromUsages(usgs);
      const autoExpired = calcAutoExpiredDays(leave.carriedOverDays, consumedDays);
      const remaining = calcRemainingDays({
        grantedDays: leave.grantedDays,
        carriedOverDays: leave.carriedOverDays,
        consumedDays,
        expiredDays: autoExpired,
      });

      const usageRate =
        leave.grantedDays > 0
          ? Math.round((consumedDays / leave.grantedDays) * 100)
          : 0;

      result.push({
        id: emp.id,
        name: emp.name,
        assignment,
        isRetired: emp.status === "retired",
        retiredDate: emp.retiredDate === "" ? null : emp.retiredDate,
        grantDate: grantDateStr,
        grantedDays: leave.grantedDays,
        carriedOverDays: leave.carriedOverDays,
        consumedDays,
        remainingDays: Math.max(0, remaining),
        expiredDays: autoExpired,
        usageRate,
        achieved5Days: consumedDays >= 5,
      });
    }

    result.sort((a, b) => a.id.localeCompare(b.id));

    return NextResponse.json({
      year,
      month,
      totalCount: result.length,
      employees: result,
    });
  } catch (e) {
    console.error("[grant-cycle-review] error:", e);
    return NextResponse.json(
      { error: "内部エラーが発生しました" },
      { status: 500 },
    );
  }
}
