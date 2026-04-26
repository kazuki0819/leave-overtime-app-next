import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ensureDbInitialized } from "@/lib/init-db";
import { db } from "@/lib/db";
import { employees, paidLeaves, assignmentHistories } from "@/lib/schema";
import { eq, and, lte, gte, or } from "drizzle-orm";
import { calcAllGrantDates, isGrantedInMonth } from "@/lib/leave-calc";

const querySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

function grantDateToFiscalYear(grantDate: Date): number {
  const month = grantDate.getMonth() + 1;
  const year = grantDate.getFullYear();
  return month >= 4 ? year : year - 1;
}

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

  try {
    const allEmployees = await db.select().from(employees);
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

      const fiscalYear = grantDateToFiscalYear(grantDate);
      const leaveRows = await db
        .select()
        .from(paidLeaves)
        .where(
          and(
            eq(paidLeaves.employeeId, emp.id),
            eq(paidLeaves.fiscalYear, fiscalYear),
          ),
        )
        .limit(1);
      const leave = leaveRows[0];
      if (!leave) {
        console.warn(
          `[grant-cycle-review] paid_leaves not found: employee_id=${emp.id}, fiscal_year=${fiscalYear}`,
        );
        continue;
      }

      const assignment = await getAssignmentAtDate(emp.id, grantDateStr);

      const usageRate =
        leave.grantedDays > 0
          ? Math.round((leave.consumedDays / leave.grantedDays) * 100)
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
        consumedDays: leave.consumedDays,
        remainingDays: leave.remainingDays,
        expiredDays: leave.expiredDays,
        usageRate,
        achieved5Days: leave.consumedDays >= 5,
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
