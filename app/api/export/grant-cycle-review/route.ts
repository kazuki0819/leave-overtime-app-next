import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ensureDbInitialized } from "@/lib/init-db";
import { db } from "@/lib/db";
import { employees, paidLeaves, assignmentHistories, leaveUsages } from "@/lib/schema";
import { eq, and, lte, gte, or } from "drizzle-orm";
import { isGrantedInMonth, calcAllGrantDates, calcConsumedDaysFromUsages, calcUsageRate } from "@/lib/leave-calc";

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

function escapeCsv(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
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
  const filename = `grant-cycle-review_${year}${String(month).padStart(2, "0")}.csv`;

  const header = "社員ID,氏名,残日数,取得率,年5日達成,付与日数,繰越日数,消化日数,時効日数,配属先,退職フラグ,退職日";

  try {
    const allEmployees = await db.select().from(employees);

    const allUsages = await db.select().from(leaveUsages)
      .where(eq(leaveUsages.isVoided, 0));

    const dataRows: string[] = [];

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
        .where(eq(paidLeaves.employeeId, emp.id))
        .limit(1);
      const leave = leaveRows[0];
      if (!leave) continue;

      const assignment = await getAssignmentAtDate(emp.id, grantDateStr);
      const isRetired = emp.status === "retired";
      const retiredDate = emp.retiredDate === "" ? null : emp.retiredDate;

      const usgs = allUsages.filter(u =>
        u.employeeId === emp.id &&
        u.recordDate >= leave.cycleStartDate &&
        u.recordDate <= leave.cycleEndDate
      );
      const consumedDays = calcConsumedDaysFromUsages(usgs);
      const isCurrentCycle = leave.finalRemaining === null;
      const remaining = leave.finalRemaining ?? leave.currentRemaining;
      const expiredDays = isCurrentCycle ? null : leave.expiredDays;
      const usageRate = calcUsageRate({
        grantedDays: leave.grantedDays,
        carriedOverDays: leave.carriedOverDays,
        consumedDays,
      });

      dataRows.push(
        [
          escapeCsv(emp.id),
          escapeCsv(emp.name),
          escapeCsv(Math.max(0, remaining ?? 0)),
          escapeCsv(`${Math.round(usageRate * 100)}%`),
          escapeCsv(consumedDays >= 5 ? "達成" : "未達成"),
          escapeCsv(leave.grantedDays),
          escapeCsv(leave.carriedOverDays),
          escapeCsv(consumedDays),
          escapeCsv(expiredDays === null ? "" : String(expiredDays)),
          escapeCsv(assignment),
          escapeCsv(isRetired ? "退職" : ""),
          escapeCsv(retiredDate ?? ""),
        ].join(","),
      );
    }

    const BOM = "﻿";
    const csv = BOM + header + "\n" + dataRows.join("\n");

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=${filename}`,
      },
    });
  } catch (e) {
    console.error("[export/grant-cycle-review] error:", e);
    return NextResponse.json(
      { error: "CSV出力中にエラーが発生しました" },
      { status: 500 },
    );
  }
}
