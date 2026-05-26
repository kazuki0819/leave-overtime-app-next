import { describe, test, expect, beforeEach } from "vitest";
import { calculatePaidLeavesForEmployee } from "../paid-leave-calc";
import { db } from "../db";
import { employees, paidLeaves, leaveUsages } from "../schema";
import { eq } from "drizzle-orm";

const TEST_IDS = ["ADJ_A", "ADJ_B", "ADJ_C"];

async function cleanup() {
  for (const id of TEST_IDS) {
    await db.delete(paidLeaves).where(eq(paidLeaves.employeeId, id));
    await db.delete(leaveUsages).where(eq(leaveUsages.employeeId, id));
    await db.delete(employees).where(eq(employees.id, id));
  }
}

function usageRecord(employeeId: string, recordDate: string, days: number) {
  return {
    employeeId,
    startDate: recordDate,
    endDate: recordDate,
    recordDate,
    days,
    recordType: "usage" as const,
    isVoided: 0,
  };
}

function adjustmentRecord(employeeId: string, recordDate: string, days: number, reason: string) {
  return {
    employeeId,
    startDate: recordDate,
    endDate: recordDate,
    recordDate,
    days,
    recordType: "adjustment" as const,
    reason,
    isVoided: 0,
  };
}

describe("選択肢B: 補正値を残日数計算に反映", () => {
  beforeEach(cleanup);

  // joinDate=2020-04-01 のサイクル構造:
  //   cycle0: 2020-04-01 ~ 2020-09-30  granted=0
  //   cycle1: 2020-10-01 ~ 2021-09-30  granted=10
  //   cycle2: 2021-10-01 ~ 2022-09-30  granted=11
  //   cycle3: 2022-10-01 ~ 2023-09-30  granted=12
  //   cycle4: 2023-10-01 ~ 2024-09-30  granted=14

  test("ケースA: 補正なし・時効あり", async () => {
    await db.insert(employees).values({
      id: "ADJ_A",
      name: "ケースA",
      joinDate: "2020-04-01",
    });

    await db.insert(leaveUsages).values([
      usageRecord("ADJ_A", "2021-03-01", 2),  // cycle1: 2日
      usageRecord("ADJ_A", "2022-03-01", 3),  // cycle2: 3日
      usageRecord("ADJ_A", "2023-03-01", 1),  // cycle3: 1日
    ]);

    // today を cycle5 内に設定し、cycle0-4 を全て確定させる
    await calculatePaidLeavesForEmployee("ADJ_A", { today: new Date("2024-12-01") });

    const results = await db
      .select()
      .from(paidLeaves)
      .where(eq(paidLeaves.employeeId, "ADJ_A"))
      .orderBy(paidLeaves.cycleStartDate);

    // cycle0
    expect(results[0].grantedDays).toBe(0);
    expect(results[0].carriedOverDays).toBe(0);
    expect(results[0].finalRemaining).toBe(0);

    // cycle1: granted=10, carry=0, usage=2 → final=8
    expect(results[1].grantedDays).toBe(10);
    expect(results[1].carriedOverDays).toBe(0);
    expect(results[1].baselineRemaining).toBe(10);
    expect(results[1].finalRemaining).toBe(8);

    // cycle2: granted=11, carry=8, usage=3, expired=0 → final=16
    //   時効: cycle0付与=0, 累積消化=5 → expired=max(0,0-5)=0
    expect(results[2].grantedDays).toBe(11);
    expect(results[2].carriedOverDays).toBe(8);
    expect(results[2].baselineRemaining).toBe(19);
    expect(results[2].finalRemaining).toBe(16);

    // cycle3: granted=12, carry=11, usage=1, expired=5
    //   時効: cycle1付与=10, 累積消化(cycle1開始～cycle3開始前)=2+3=5 → expired=max(0,10-5)=5
    //   carry = max(0, 16-5) = 11, min(11, previousGranted=11) = 11
    expect(results[3].grantedDays).toBe(12);
    expect(results[3].carriedOverDays).toBe(11);
    expect(results[3].baselineRemaining).toBe(23);
    expect(results[3].finalRemaining).toBe(22);

    // cycle4: granted=14, carry=12, usage=0, expired=7
    //   時効: cycle2付与=11, 累積消化(cycle2開始～cycle4開始前)=3+1=4 → expired=max(0,11-4)=7
    //   carry = max(0, 22-7) = 15, min(15, previousGranted=12) = 12
    expect(results[4].grantedDays).toBe(14);
    expect(results[4].carriedOverDays).toBe(12);
    expect(results[4].baselineRemaining).toBe(26);
    expect(results[4].finalRemaining).toBe(26);
  });

  // joinDate=2024-04-01 のサイクル構造:
  //   cycle0: 2024-04-01 ~ 2024-09-30  granted=0
  //   cycle1: 2024-10-01 ~ 2025-09-30  granted=10
  //   cycle2: 2025-10-01 ~ 2026-09-30  granted=11

  test("ケースB: 補正あり・時効なし範囲", async () => {
    await db.insert(employees).values({
      id: "ADJ_B",
      name: "ケースB",
      joinDate: "2024-04-01",
    });

    await db.insert(leaveUsages).values([
      usageRecord("ADJ_B", "2025-03-01", 3),                              // cycle1: usage 3日
      adjustmentRecord("ADJ_B", "2025-03-15", -2, "前職残日数の修正"),     // cycle1: adjustment -2(残増)
    ]);

    // today を cycle2 内に設定(cycle1確定、cycle2進行中)
    await calculatePaidLeavesForEmployee("ADJ_B", { today: new Date("2026-01-01") });

    const results = await db
      .select()
      .from(paidLeaves)
      .where(eq(paidLeaves.employeeId, "ADJ_B"))
      .orderBy(paidLeaves.cycleStartDate);

    // cycle1: granted=10, cycleUsage = 3+(-2) = 1, final = 10-1 = 9
    expect(results[1].grantedDays).toBe(10);
    expect(results[1].carriedOverDays).toBe(0);
    expect(results[1].baselineRemaining).toBe(10);
    expect(results[1].finalRemaining).toBe(9);

    // cycle2(進行中): carry=9, baseline=20, current=20
    expect(results[2].grantedDays).toBe(11);
    expect(results[2].carriedOverDays).toBe(9);
    expect(results[2].baselineRemaining).toBe(20);
    expect(results[2].currentRemaining).toBe(20);
    expect(results[2].finalRemaining).toBe(null);
  });

  // 二系統分離の核心検証:
  // 補正(adjustment)は残日数(final/current)に反映されるが、
  // 時効計算の母数(cumulativeUsage)には含まれない。
  //
  // cycle1 に usage=2, adjustment=-2 がある場合:
  //   残日数計算: cycleUsage = 2+(-2) = 0 → final = 10
  //   時効計算:   累積消化 = 2(usageのみ) → expired = max(0, 10-2) = 8
  //
  // もし adjustment が時効母数に混入すると:
  //   累積消化 = 2+(-2) = 0 → expired = max(0, 10-0) = 10
  //   carry = max(0, 21-10) = 11, baseline = 12+11 = 23(誤り)
  //
  // 正しくは expired=8, carry=13, baseline=25

  test("ケースC: 補正あり・時効あり(二系統分離の検証)", async () => {
    await db.insert(employees).values({
      id: "ADJ_C",
      name: "ケースC",
      joinDate: "2020-04-01",
    });

    await db.insert(leaveUsages).values([
      usageRecord("ADJ_C", "2021-03-01", 2),                          // cycle1: usage 2日
      adjustmentRecord("ADJ_C", "2021-03-15", -2, "残日数補正"),       // cycle1: adjustment -2(残増)
    ]);

    // today を cycle3 内に設定(cycle0-2確定、cycle3進行中)
    await calculatePaidLeavesForEmployee("ADJ_C", { today: new Date("2023-01-01") });

    const results = await db
      .select()
      .from(paidLeaves)
      .where(eq(paidLeaves.employeeId, "ADJ_C"))
      .orderBy(paidLeaves.cycleStartDate);

    // cycle1: cycleUsage = 2+(-2) = 0, final = 10-0 = 10
    expect(results[1].grantedDays).toBe(10);
    expect(results[1].finalRemaining).toBe(10);

    // cycle2: 時効=max(0, cycle0付与0 - 累積usageOnly from joinDate=2) = 0
    //   carry = max(0, 10-0) = 10, baseline = 11+10 = 21
    expect(results[2].grantedDays).toBe(11);
    expect(results[2].carriedOverDays).toBe(10);
    expect(results[2].baselineRemaining).toBe(21);
    expect(results[2].finalRemaining).toBe(21);

    // cycle3(進行中): 時効計算が二系統分離の核心
    //   twoCyclesBackGranted = cycle1付与 = 10
    //   cumulativeUsage(usageOnly, cycle1開始～cycle3開始前) = 2  ← adjustmentの-2は含まない
    //   expired = max(0, 10-2) = 8
    //   carry = max(0, 21-8) = 13, min(13, previousGranted=11) = 11
    //   baseline = 12+11 = 23
    expect(results[3].grantedDays).toBe(12);
    expect(results[3].carriedOverDays).toBe(11);
    expect(results[3].baselineRemaining).toBe(23);
    expect(results[3].currentRemaining).toBe(23);
    expect(results[3].finalRemaining).toBe(null);
  });
});
