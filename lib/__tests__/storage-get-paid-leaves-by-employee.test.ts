import { describe, test, expect, beforeEach } from "vitest";
import { db } from "../db";
import { employees, paidLeaves, leaveUsages } from "../schema";
import { eq, asc } from "drizzle-orm";
import { storage } from "../storage";

const EMP_ID = "TEST_GPLBE";
const now = new Date().toISOString();

async function cleanup() {
  await db.delete(leaveUsages).where(eq(leaveUsages.employeeId, EMP_ID));
  await db.delete(paidLeaves).where(eq(paidLeaves.employeeId, EMP_ID));
  await db.delete(employees).where(eq(employees.id, EMP_ID));
}

async function insertEmployee() {
  await db.insert(employees).values({
    id: EMP_ID,
    name: "テスト社員",
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

async function insertUsage(recordDate: string, days: number, recordType: "usage" | "adjustment", isVoided = 0) {
  await db.insert(leaveUsages).values({
    employeeId: EMP_ID,
    startDate: recordDate,
    endDate: recordDate,
    recordDate,
    days,
    recordType,
    isVoided,
    createdAt: now,
    updatedAt: now,
  });
}

describe("getPaidLeavesByEmployee", () => {
  beforeEach(async () => {
    await cleanup();
    await insertEmployee();
  });

  test("観点1: 全サイクルが cycleStartDate 昇順で返る", async () => {
    await insertCycle({ cycleStart: "2025-10-01", cycleEnd: "2026-09-30", granted: 12, carried: 0, baseline: 12, current: 12, final: null });
    await insertCycle({ cycleStart: "2023-04-01", cycleEnd: "2023-09-30", granted: 0, carried: 0, baseline: 0, current: 0, final: 0 });
    await insertCycle({ cycleStart: "2024-10-01", cycleEnd: "2025-09-30", granted: 11, carried: 0, baseline: 11, current: 11, final: 11 });
    await insertCycle({ cycleStart: "2023-10-01", cycleEnd: "2024-09-30", granted: 10, carried: 0, baseline: 10, current: 10, final: 10 });

    const result = await storage.getPaidLeavesByEmployee(EMP_ID);

    expect(result.length).toBe(4);
    expect(result[0].cycleStartDate).toBe("2023-04-01");
    expect(result[1].cycleStartDate).toBe("2023-10-01");
    expect(result[2].cycleStartDate).toBe("2024-10-01");
    expect(result[3].cycleStartDate).toBe("2025-10-01");
  });

  test("観点2: adjustedRemaining = finalRemaining(確定) / currentRemaining(進行中)、isInProgress", async () => {
    await insertCycle({ cycleStart: "2023-10-01", cycleEnd: "2024-09-30", granted: 10, carried: 0, baseline: 10, current: 7, final: 7 });
    await insertCycle({ cycleStart: "2024-10-01", cycleEnd: "2025-09-30", granted: 11, carried: 7, baseline: 18, current: 15, final: null });

    const result = await storage.getPaidLeavesByEmployee(EMP_ID);

    // 確定サイクル
    expect(result[0].adjustedRemaining).toBe(7);
    expect(result[0].isInProgress).toBe(false);
    // 進行中サイクル
    expect(result[1].adjustedRemaining).toBe(15);
    expect(result[1].isInProgress).toBe(true);
  });

  test("観点3: autoRemaining = max(0, baselineRemaining − usageOnlyDays)", async () => {
    // baseline=20, usage=3 → autoRemaining=17
    await insertCycle({ cycleStart: "2024-10-01", cycleEnd: "2025-09-30", granted: 10, carried: 10, baseline: 20, current: 19, final: 19 });
    await insertUsage("2025-01-10", 2, "usage");
    await insertUsage("2025-03-15", 1, "usage");
    // adjustment は autoRemaining に影響しない
    await insertUsage("2025-02-01", -2, "adjustment");

    const result = await storage.getPaidLeavesByEmployee(EMP_ID);

    expect(result[0].autoRemaining).toBe(17); // max(0, 20 - 3) = 17
  });

  test("観点3補足: autoRemaining の 0クランプ", async () => {
    // baseline=5, usage=8 → autoRemaining=0(クランプ)
    await insertCycle({ cycleStart: "2024-10-01", cycleEnd: "2025-09-30", granted: 5, carried: 0, baseline: 5, current: 0, final: 0 });
    await insertUsage("2025-01-10", 5, "usage");
    await insertUsage("2025-03-15", 3, "usage");

    const result = await storage.getPaidLeavesByEmployee(EMP_ID);

    expect(result[0].autoRemaining).toBe(0); // max(0, 5 - 8) = 0
  });

  test("観点4: usageOnlyDays はサイクル期間内の usage のみ集計(adjustment を含まない)", async () => {
    await insertCycle({ cycleStart: "2024-10-01", cycleEnd: "2025-09-30", granted: 10, carried: 0, baseline: 10, current: 5, final: 5 });
    // usage
    await insertUsage("2025-01-10", 3, "usage");
    await insertUsage("2025-05-20", 2, "usage");
    // adjustment (集計対象外)
    await insertUsage("2025-02-01", -2, "adjustment");
    await insertUsage("2025-03-01", 1, "adjustment");
    // サイクル外の usage (集計対象外)
    await insertUsage("2024-09-30", 5, "usage");
    await insertUsage("2025-10-01", 5, "usage");

    const result = await storage.getPaidLeavesByEmployee(EMP_ID);

    expect(result[0].usageOnlyDays).toBe(5); // 3 + 2 のみ
  });

  test("観点5: adjustmentDays はサイクル期間内の adjustment のみ集計(符号付き)", async () => {
    await insertCycle({ cycleStart: "2024-10-01", cycleEnd: "2025-09-30", granted: 10, carried: 0, baseline: 10, current: 11, final: 11 });
    // adjustment
    await insertUsage("2025-01-15", -3, "adjustment"); // 残を増やす
    await insertUsage("2025-04-01", 1, "adjustment");  // 残を減らす
    // usage (集計対象外)
    await insertUsage("2025-02-01", 2, "usage");
    // サイクル外の adjustment (集計対象外)
    await insertUsage("2024-09-30", -10, "adjustment");

    const result = await storage.getPaidLeavesByEmployee(EMP_ID);

    expect(result[0].adjustmentDays).toBe(-2); // -3 + 1 = -2
  });

  test("観点6: サイクル境界(cycleStartDate/cycleEndDate ちょうど)のレコードが含まれる", async () => {
    await insertCycle({ cycleStart: "2024-10-01", cycleEnd: "2025-09-30", granted: 10, carried: 0, baseline: 10, current: 7, final: 7 });
    // ちょうど cycleStartDate
    await insertUsage("2024-10-01", 1, "usage");
    // ちょうど cycleEndDate
    await insertUsage("2025-09-30", 2, "usage");
    // ちょうど cycleStartDate の adjustment
    await insertUsage("2024-10-01", -1, "adjustment");
    // ちょうど cycleEndDate の adjustment
    await insertUsage("2025-09-30", -0.5, "adjustment");

    const result = await storage.getPaidLeavesByEmployee(EMP_ID);

    expect(result[0].usageOnlyDays).toBe(3);    // 1 + 2
    expect(result[0].adjustmentDays).toBe(-1.5); // -1 + (-0.5)
  });

  test("観点7a: 補正あり(クランプなし)で adjustedRemaining − autoRemaining が補正影響分", async () => {
    // baseline=20, usage=3, adj=-2(残を2日増やす)
    // DB上: cycleUsage = 3+(-2)=1, current = max(0, 20-1) = 19, final = 19
    // autoRemaining = max(0, 20-3) = 17
    // adjustedRemaining = 19
    // diff = 19 - 17 = 2 = -adjustmentDays
    await insertCycle({ cycleStart: "2024-10-01", cycleEnd: "2025-09-30", granted: 10, carried: 10, baseline: 20, current: 19, final: 19 });
    await insertUsage("2025-01-10", 3, "usage");
    await insertUsage("2025-02-01", -2, "adjustment");

    const result = await storage.getPaidLeavesByEmployee(EMP_ID);
    const cycle = result[0];

    expect(cycle.adjustedRemaining).toBe(19);
    expect(cycle.autoRemaining).toBe(17);
    expect(cycle.adjustedRemaining - cycle.autoRemaining).toBe(2);
    expect(cycle.adjustedRemaining - cycle.autoRemaining).toBe(-cycle.adjustmentDays);
  });

  test("観点7b: 補正あり(クランプあり)で diff と −adjustmentDays が乖離する", async () => {
    // baseline=5, usage=6, adj=-2(残を2日増やす)
    // DB上: cycleUsage = 6+(-2)=4, current = max(0, 5-4) = 1, final = 1
    // autoRemaining = max(0, 5-6) = 0 (クランプ)
    // adjustedRemaining = 1
    // diff = 1 - 0 = 1 ≠ -adjustmentDays(=2)
    await insertCycle({ cycleStart: "2024-10-01", cycleEnd: "2025-09-30", granted: 5, carried: 0, baseline: 5, current: 1, final: 1 });
    await insertUsage("2025-01-10", 6, "usage");
    await insertUsage("2025-02-01", -2, "adjustment");

    const result = await storage.getPaidLeavesByEmployee(EMP_ID);
    const cycle = result[0];

    expect(cycle.adjustedRemaining).toBe(1);
    expect(cycle.autoRemaining).toBe(0);
    expect(cycle.adjustedRemaining - cycle.autoRemaining).toBe(1);
    expect(-cycle.adjustmentDays).toBe(2);
    // diff(1) ≠ -adjustmentDays(2) — クランプにより乖離。これは正しい挙動
    expect(cycle.adjustedRemaining - cycle.autoRemaining).not.toBe(-cycle.adjustmentDays);
  });

  test("観点8: isVoided=1 のレコードが集計から除外される", async () => {
    await insertCycle({ cycleStart: "2024-10-01", cycleEnd: "2025-09-30", granted: 10, carried: 0, baseline: 10, current: 7, final: 7 });
    // 有効な usage
    await insertUsage("2025-01-10", 3, "usage");
    // voided usage (除外される)
    await insertUsage("2025-02-01", 5, "usage", 1);
    // 有効な adjustment
    await insertUsage("2025-03-01", -1, "adjustment");
    // voided adjustment (除外される)
    await insertUsage("2025-04-01", -10, "adjustment", 1);

    const result = await storage.getPaidLeavesByEmployee(EMP_ID);

    expect(result[0].usageOnlyDays).toBe(3);    // voided の 5 は含まれない
    expect(result[0].adjustmentDays).toBe(-1);   // voided の -10 は含まれない
  });

  test("サイクルなしの社員は空配列を返す", async () => {
    const result = await storage.getPaidLeavesByEmployee(EMP_ID);
    expect(result).toEqual([]);
  });
});
