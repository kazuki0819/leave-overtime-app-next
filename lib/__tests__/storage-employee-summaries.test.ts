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
    expiredDays: 0,
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

describe("getEmployeeSummaries record_date ベース動的計算", () => {
  beforeEach(async () => {
    await cleanup();
    await insertEmployee();
  });

  test("付与14 + 繰越6 + 消化8.0日 → 残日数12.0（齋藤玲パターン）", async () => {
    await insertCycle({
      cycleStart: "2025-10-01",
      cycleEnd: "2026-09-30",
      granted: 14,
      carried: 6,
      baseline: 20,
      current: 26,
      final: 26,
    });

    const plRows = await db.select().from(paidLeaves).where(eq(paidLeaves.employeeId, EMP_ID));
    const plId = plRows[0].id;

    for (let i = 0; i < 8; i++) {
      const month = String(i + 1).padStart(2, "0");
      await insertUsage(`2025-${month === "01" ? "10" : month <= "03" ? `${10 + parseInt(month)}` : `0${parseInt(month) - 3}`}-15`, 1.0, "usage", plId);
    }

    await db.delete(leaveUsages).where(eq(leaveUsages.employeeId, EMP_ID));
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
  });

  test("補正値あり: usage 2.0日 + adjustment -3.0日 → 残日数21.0", async () => {
    await insertCycle({
      cycleStart: "2025-04-01",
      cycleEnd: "2026-03-31",
      granted: 20,
      carried: 5,
      baseline: 25,
      current: 99,
      final: 99,
    });

    const plRows = await db.select().from(paidLeaves).where(eq(paidLeaves.employeeId, EMP_ID));
    const plId = plRows[0].id;

    await insertUsage("2025-05-10", 2.0, "usage", plId);
    await insertUsage("2025-06-15", -3.0, "adjustment", plId);

    const summaries = await storage.getEmployeeSummaries(2025);
    const emp = findEmpSummary(summaries);

    expect(emp.paidLeave).not.toBeNull();
    // allTotal = 2 + (-3) = -1
    // expired = calcAutoExpiredDays(5, -1) = 5 (FIFO: max(0,-1)=0 consumed from carryover)
    // remaining = max(0, 20 + 5 - (-1) - 5) = 21
    expect(emp.paidLeave.consumedDays).toBe(-1);
    expect(emp.paidLeave.expiredDays).toBe(5);
    expect(emp.paidLeave.remainingDays).toBe(21);
    // autoRemainingDays uses only usage records (2.0)
    // expiredAuto = calcAutoExpiredDays(5, 2) = 3
    // autoRemaining = max(0, 20 + 5 - 2 - 3) = 20
    expect(emp.paidLeave.autoRemainingDays).toBe(20);
  });

  test("サイクル外の消化レコードはスナップショットではなく record_date で除外される", async () => {
    await insertCycle({
      cycleStart: "2025-10-01",
      cycleEnd: "2026-09-30",
      granted: 14,
      carried: 6,
      baseline: 20,
      current: 5,
      final: 5,
    });

    const plRows = await db.select().from(paidLeaves).where(eq(paidLeaves.employeeId, EMP_ID));
    const plId = plRows[0].id;

    await insertUsage("2025-10-15", 1.5, "usage", plId);
    await insertUsage("2025-11-15", 1.5, "usage", plId);
    // サイクル外: この消化は集計に含まれない
    await insertUsage("2025-09-01", 5.0, "usage", plId);

    const summaries = await storage.getEmployeeSummaries(2025);
    const emp = findEmpSummary(summaries);

    // サイクル内の消化のみ: 1.5 + 1.5 = 3.0
    // expired = calcAutoExpiredDays(6, 3) = 3
    // remaining = max(0, 14 + 6 - 3 - 3) = 14
    expect(emp.paidLeave.consumedDays).toBe(3.0);
    expect(emp.paidLeave.expiredDays).toBe(3);
    expect(emp.paidLeave.remainingDays).toBe(14);
  });
});
