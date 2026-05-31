import { describe, test, expect, beforeEach } from "vitest";
import { db } from "../db";
import { employees, paidLeaves, leaveUsages } from "../schema";
import { eq } from "drizzle-orm";
import { storage } from "../storage";

const EMP_ID = "TEST_SUMMARIES";
const now = new Date().toISOString();

async function cleanup() {
  await db.delete(leaveUsages).where(eq(leaveUsages.employeeId, EMP_ID));
  await db.delete(paidLeaves).where(eq(paidLeaves.employeeId, EMP_ID));
  await db.delete(employees).where(eq(employees.id, EMP_ID));
}

async function insertEmployee() {
  await db.insert(employees).values({
    id: EMP_ID,
    name: "サマリテスト社員",
    joinDate: "2023-04-01",
  });
}

async function insertCycle(opts: {
  cycleStart: string;
  cycleEnd: string;
  granted: number;
  carried: number;
  baseline: number;
  current: number;
  final: number | null;
  expired?: number;
}) {
  await db.insert(paidLeaves).values({
    employeeId: EMP_ID,
    cycleStartDate: opts.cycleStart,
    cycleEndDate: opts.cycleEnd,
    grantedDays: opts.granted,
    carriedOverDays: opts.carried,
    baselineRemaining: opts.baseline,
    currentRemaining: opts.current,
    finalRemaining: opts.final,
    expiredDays: opts.expired ?? 0,
    createdAt: now,
    updatedAt: now,
  });
}

async function insertUsage(
  recordDate: string,
  days: number,
  recordType: "usage" | "adjustment" = "usage",
  paidLeaveId = 0,
) {
  await db.insert(leaveUsages).values({
    employeeId: EMP_ID,
    startDate: recordDate,
    endDate: recordDate,
    recordDate,
    days,
    recordType,
    paidLeaveId,
    isVoided: 0,
    createdAt: now,
    updatedAt: now,
  });
}

function findEmpSummary(summaries: any[]) {
  return summaries.find((s: any) => s.id === EMP_ID);
}

describe("getEmployeeSummaries DB 値読み", () => {
  beforeEach(async () => {
    await cleanup();
    await insertEmployee();
  });

  test("付与14 + 繰越6 + 消化8.0日 → DB 残日数12.0（齋藤玲パターン）", async () => {
    await insertCycle({
      cycleStart: "2025-10-01",
      cycleEnd: "2026-09-30",
      granted: 14,
      carried: 6,
      baseline: 20,
      current: 12,
      final: null,
      expired: 0,
    });

    const plRows = await db.select().from(paidLeaves).where(eq(paidLeaves.employeeId, EMP_ID));
    const plId = plRows[0].id;

    const dates = [
      "2025-10-15", "2025-11-15", "2025-12-15",
      "2026-01-15", "2026-02-15", "2026-03-15",
      "2026-04-15", "2026-05-15",
    ];
    for (const d of dates) {
      await insertUsage(d, 1.0, "usage", plId);
    }

    const summaries = await storage.getEmployeeSummaries(2025);
    const emp = findEmpSummary(summaries);

    expect(emp).toBeDefined();
    expect(emp.paidLeave).not.toBeNull();
    expect(emp.paidLeave.consumedDays).toBe(8.0);
    expect(emp.paidLeave.expiredDays).toBe(0);
    expect(emp.paidLeave.remainingDays).toBe(12.0);
    expect(emp.paidLeave.adjustedRemainingDays).toBe(12.0);
    expect(emp.paidLeave.autoRemainingDays).toBe(12.0);
  });

  test("補正値あり: usage 2.0日 + adjustment -3.0日 → DB 残日数26.0", async () => {
    await insertCycle({
      cycleStart: "2025-04-01",
      cycleEnd: "2026-03-31",
      granted: 20,
      carried: 5,
      baseline: 25,
      current: 26,
      final: null,
      expired: 0,
    });

    const plRows = await db.select().from(paidLeaves).where(eq(paidLeaves.employeeId, EMP_ID));
    const plId = plRows[0].id;

    await insertUsage("2025-05-10", 2.0, "usage", plId);
    await insertUsage("2025-06-15", -3.0, "adjustment", plId);

    const summaries = await storage.getEmployeeSummaries(2025);
    const emp = findEmpSummary(summaries);

    expect(emp.paidLeave).not.toBeNull();
    expect(emp.paidLeave.consumedDays).toBe(-1);
    expect(emp.paidLeave.expiredDays).toBe(0);
    expect(emp.paidLeave.remainingDays).toBe(26);
    // autoRemainingDays = baseline(25) - usageOnly(2) = 23
    expect(emp.paidLeave.autoRemainingDays).toBe(23);
  });

  test("サイクル外の消化レコードは record_date で除外される", async () => {
    await insertCycle({
      cycleStart: "2025-10-01",
      cycleEnd: "2026-09-30",
      granted: 14,
      carried: 6,
      baseline: 20,
      current: 17,
      final: null,
      expired: 0,
    });

    const plRows = await db.select().from(paidLeaves).where(eq(paidLeaves.employeeId, EMP_ID));
    const plId = plRows[0].id;

    await insertUsage("2025-10-15", 1.5, "usage", plId);
    await insertUsage("2025-11-15", 1.5, "usage", plId);
    // サイクル外: この消化は consumedDays 集計に含まれない
    await insertUsage("2025-09-01", 5.0, "usage", plId);

    const summaries = await storage.getEmployeeSummaries(2025);
    const emp = findEmpSummary(summaries);

    // サイクル内の消化のみ: 1.5 + 1.5 = 3.0
    expect(emp.paidLeave.consumedDays).toBe(3.0);
    expect(emp.paidLeave.expiredDays).toBe(0);
    // remainingDays = max(0, currentRemaining=17) = 17
    expect(emp.paidLeave.remainingDays).toBe(17);
    // autoRemainingDays = baseline(20) - usageOnly(3) = 17
    expect(emp.paidLeave.autoRemainingDays).toBe(17);
  });
});
