import { addMonths, addYears, subDays } from "date-fns";
import { db } from "./db";
import { paidLeaves, leaveUsages, employees } from "./schema";
import { and, eq, gte, lte, asc, desc, inArray } from "drizzle-orm";

// ═══════════════════════════════════════════════════════════════
// 純粋関数
// ═══════════════════════════════════════════════════════════════

export function calculateGrantedDays(
  joinDate: Date,
  cycleNumber: number,
  isExempt: boolean = false
): number {
  if (cycleNumber === 0) return 0;
  if (isExempt) return 0;

  const grantTable: Record<number, number> = {
    1: 10,
    2: 11,
    3: 12,
    4: 14,
    5: 16,
    6: 18,
  };
  return grantTable[cycleNumber] ?? 20;
}

export function isEndOfMonthAugustHire(joinDate: Date): boolean {
  const month = joinDate.getMonth() + 1;
  const day = joinDate.getDate();
  return month === 8 && day >= 28 && day <= 31;
}

export function calculateCycleStartDate(
  joinDate: Date,
  cycleNumber: number
): Date {
  if (cycleNumber === 0) {
    return new Date(joinDate);
  }

  if (isEndOfMonthAugustHire(joinDate)) {
    const baseYear = joinDate.getFullYear() + 1;
    const baseDate = new Date(baseYear, 1, 28);
    return addYears(baseDate, cycleNumber - 1);
  }

  const firstCycleStart = addMonths(joinDate, 6);
  return addYears(firstCycleStart, cycleNumber - 1);
}

export function calculateCycleEndDate(
  joinDate: Date,
  cycleNumber: number
): Date {
  const nextStart = calculateCycleStartDate(joinDate, cycleNumber + 1);
  return subDays(nextStart, 1);
}

export function calculateExpiredDays(
  twoCyclesBackGranted: number,
  cumulativeUsageFromTwoBack: number
): number {
  return Math.max(0, twoCyclesBackGranted - cumulativeUsageFromTwoBack);
}

export function calculateCarriedOverDays(
  previousFinalRemaining: number,
  expiredAmount: number
): number {
  return Math.max(0, previousFinalRemaining - expiredAmount);
}

export function formatISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ═══════════════════════════════════════════════════════════════
// DB操作関数
// ═══════════════════════════════════════════════════════════════

export type RecalcSource = "auto-recalc" | "regenerate" | "cron" | "manual" | "test";

interface CalculateOptions {
  exemptCycleNumbers?: number[];
  today?: Date;
  source?: RecalcSource;
}

export async function calculatePaidLeavesForEmployee(
  employeeId: string,
  options?: CalculateOptions
): Promise<void> {
  const startTime = Date.now();
  const source = options?.source ?? "manual";
  const today = options?.today ?? new Date();
  const exemptCycles = new Set(options?.exemptCycleNumbers ?? []);

  const employeeRows = await db
    .select()
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);

  const employee = employeeRows[0];
  if (!employee) {
    throw new Error(`Employee not found: ${employeeId}`);
  }

  if (!employee.joinDate) {
    throw new Error(`Employee has no joinDate: ${employeeId}`);
  }

  const joinDate = new Date(employee.joinDate);

  const effectiveEndDate: Date =
    employee.status === "retired" && employee.retiredDate !== ""
      ? new Date(employee.retiredDate)
      : today;

  // 時効計算用: usage のみ（補正値は時効母数に含めない）
  const usagesOnly = await db
    .select()
    .from(leaveUsages)
    .where(
      and(
        eq(leaveUsages.employeeId, employeeId),
        eq(leaveUsages.isVoided, 0),
        eq(leaveUsages.recordType, "usage")
      )
    )
    .orderBy(asc(leaveUsages.recordDate));

  // 残日数計算用: usage + adjustment（符号付き）
  const usagesAndAdj = await db
    .select()
    .from(leaveUsages)
    .where(
      and(
        eq(leaveUsages.employeeId, employeeId),
        eq(leaveUsages.isVoided, 0),
        inArray(leaveUsages.recordType, ["usage", "adjustment"])
      )
    )
    .orderBy(asc(leaveUsages.recordDate));

  let maxCycleNumber = 0;
  {
    let n = 0;
    while (calculateCycleStartDate(joinDate, n) <= effectiveEndDate) {
      maxCycleNumber = n;
      n++;
      if (n > 100) break;
    }
  }

  await db.transaction(async (tx) => {
    await tx.delete(paidLeaves).where(eq(paidLeaves.employeeId, employeeId));

    let previousFinalRemaining = 0;
    let previousGrantedDays = 0;
    let twoCyclesBackGranted = 0;
    let twoCyclesBackStart: Date | null = null;
    let previousCycleId: number | null = null;

    const startCycle = 0;

    for (let cycleNumber = startCycle; cycleNumber <= maxCycleNumber; cycleNumber++) {
      let cycleStart: Date;
      let cycleEnd: Date;
      let granted: number;
      let carry: number;
      let expired = 0;

      cycleStart = calculateCycleStartDate(joinDate, cycleNumber);
      cycleEnd = calculateCycleEndDate(joinDate, cycleNumber);
      const cycleStartStr = formatISODate(cycleStart);
      const cycleEndStr = formatISODate(cycleEnd);

      granted = calculateGrantedDays(joinDate, cycleNumber, exemptCycles.has(cycleNumber));

      if (cycleNumber === 0 || cycleNumber === 1) {
        carry = 0;
      } else {
        let cumulativeUsageFromTwoBack = 0;
        if (twoCyclesBackStart) {
          const twoCyclesBackStartStr = formatISODate(twoCyclesBackStart);
          cumulativeUsageFromTwoBack = usagesOnly
            .filter((u) => u.recordDate >= twoCyclesBackStartStr && u.recordDate < cycleStartStr)
            .reduce((sum, u) => sum + u.days, 0);
        }
        expired = calculateExpiredDays(twoCyclesBackGranted, cumulativeUsageFromTwoBack);
        carry = calculateCarriedOverDays(previousFinalRemaining, expired);
        carry = Math.min(carry, previousGrantedDays);
      }

      const baseline = granted + carry;
      const cycleUsage = usagesAndAdj
        .filter((u) => u.recordDate >= cycleStartStr && u.recordDate <= cycleEndStr)
        .reduce((sum, u) => sum + u.days, 0);

      const current = Math.max(0, baseline - cycleUsage);
      const isInProgress = cycleStart <= today && today <= cycleEnd;
      const final = isInProgress ? null : current;

      const [inserted] = await tx.insert(paidLeaves).values({
        employeeId,
        cycleStartDate: cycleStartStr,
        cycleEndDate: cycleEndStr,
        grantedDays: granted,
        carriedOverDays: carry,
        baselineRemaining: baseline,
        currentRemaining: current,
        finalRemaining: final,
        expiredDays: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }).returning({ id: paidLeaves.id });

      // Badge式後書き: 前サイクルの expired_days = 前サイクルの finalRemaining − 当サイクルへの carry
      if (cycleNumber >= 2 && previousCycleId !== null) {
        await tx.update(paidLeaves)
          .set({ expiredDays: previousFinalRemaining - carry, updatedAt: new Date().toISOString() })
          .where(eq(paidLeaves.id, previousCycleId));
      }

      previousCycleId = inserted.id;

      twoCyclesBackGranted = previousGrantedDays;
      twoCyclesBackStart = cycleNumber >= 1
        ? calculateCycleStartDate(joinDate, cycleNumber - 1)
        : null;
      previousGrantedDays = granted;
      previousFinalRemaining = isInProgress ? current : final!;
    }
  });

  const durationMs = Date.now() - startTime;
  console.log(
    `[paid-leave-calc] employeeId=${employeeId}, source=${source}, durationMs=${durationMs}`
  );
}

export async function ensurePaidLeavesUpToDate(
  employeeId: string,
  targetDate: Date
): Promise<void> {
  const employeeRows = await db
    .select()
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);

  const employee = employeeRows[0];
  if (!employee) return;

  if (!employee.joinDate || employee.joinDate === "") {
    console.warn(`ensurePaidLeavesUpToDate: joinDate が未設定のためスキップ (employeeId=${employeeId})`);
    return;
  }

  const latestRows = await db
    .select()
    .from(paidLeaves)
    .where(eq(paidLeaves.employeeId, employeeId))
    .orderBy(desc(paidLeaves.id))
    .limit(1);

  if (latestRows.length === 0) {
    await generatePaidLeavesUpToDate(employeeId, targetDate);
    return;
  }

  const latest = latestRows[0];
  if (latest.cycleEndDate >= formatISODate(targetDate)) {
    return;
  }

  await generatePaidLeavesUpToDate(employeeId, targetDate);
}

export async function recalculatePaidLeavesAfterUsageChange(
  employeeId: string,
  affectedDates: Date[]
): Promise<void> {
  await calculatePaidLeavesForEmployee(employeeId, { source: "auto-recalc" });
}

export async function generatePaidLeavesUpToDate(
  employeeId: string,
  targetDate: Date
): Promise<void> {
  await calculatePaidLeavesForEmployee(employeeId, { today: targetDate, source: "cron" });
}

export async function regeneratePaidLeaves(
  employeeIds?: string[]
): Promise<{ employeeId: string; success: boolean; error?: string }[]> {
  let targets: string[];
  if (employeeIds) {
    targets = employeeIds;
  } else {
    const allEmployees = await db.select({ id: employees.id }).from(employees);
    targets = allEmployees.map((e) => e.id);
  }

  const results: { employeeId: string; success: boolean; error?: string }[] = [];
  for (const empId of targets) {
    try {
      await calculatePaidLeavesForEmployee(empId, { source: "regenerate" });
      results.push({ employeeId: empId, success: true });
    } catch (err: any) {
      results.push({ employeeId: empId, success: false, error: err.message });
    }
  }
  return results;
}

export async function getCycleByDate(
  employeeId: string,
  date: Date
): Promise<typeof paidLeaves.$inferSelect | null> {
  const dateStr = formatISODate(date);
  const result = await db
    .select()
    .from(paidLeaves)
    .where(
      and(
        eq(paidLeaves.employeeId, employeeId),
        lte(paidLeaves.cycleStartDate, dateStr),
        gte(paidLeaves.cycleEndDate, dateStr)
      )
    )
    .limit(1);
  return result[0] ?? null;
}

export async function getCurrentRemainingAtDate(
  employeeId: string,
  date: Date
): Promise<number | null> {
  const cycle = await getCycleByDate(employeeId, date);
  if (!cycle) return null;

  const dateStr = formatISODate(date);
  const usages = await db
    .select()
    .from(leaveUsages)
    .where(
      and(
        eq(leaveUsages.employeeId, employeeId),
        eq(leaveUsages.isVoided, 0),
        eq(leaveUsages.recordType, "usage"),
        gte(leaveUsages.recordDate, cycle.cycleStartDate),
        lte(leaveUsages.recordDate, dateStr)
      )
    );

  const usageSum = usages.reduce((sum, u) => sum + u.days, 0);
  return Math.max(0, cycle.baselineRemaining - usageSum);
}

export async function getUsageInPeriod(
  employeeId: string,
  startDate: Date,
  endDate: Date
): Promise<{ totalDays: number; records: (typeof leaveUsages.$inferSelect)[] }> {
  const records = await db
    .select()
    .from(leaveUsages)
    .where(
      and(
        eq(leaveUsages.employeeId, employeeId),
        eq(leaveUsages.isVoided, 0),
        eq(leaveUsages.recordType, "usage"),
        gte(leaveUsages.recordDate, formatISODate(startDate)),
        lte(leaveUsages.recordDate, formatISODate(endDate))
      )
    )
    .orderBy(asc(leaveUsages.recordDate));

  const totalDays = records.reduce((sum, r) => sum + r.days, 0);
  return { totalDays, records };
}
