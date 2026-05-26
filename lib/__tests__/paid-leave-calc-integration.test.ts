import { describe, test, expect, beforeEach } from "vitest";
import {
  calculatePaidLeavesForEmployee,
  getCurrentRemainingAtDate,
  regeneratePaidLeaves,
} from "../paid-leave-calc";
import { db } from "../db";
import { employees, paidLeaves, leaveUsages } from "../schema";
import { eq } from "drizzle-orm";

describe("calculatePaidLeavesForEmployee 統合テスト", () => {
  beforeEach(async () => {
    const testIds = ["TEST001", "TEST002", "TEST003", "TEST004", "TEST005", "TEST006", "TEST007"];
    for (const id of testIds) {
      await db.delete(paidLeaves).where(eq(paidLeaves.employeeId, id));
      await db.delete(leaveUsages).where(eq(leaveUsages.employeeId, id));
      await db.delete(employees).where(eq(employees.id, id));
    }
  });

  test("シナリオ1: 入社直後(6ヶ月未満)、第0サイクルのみ生成", async () => {
    await db.insert(employees).values({
      id: "TEST001",
      name: "テスト1",
      joinDate: "2026-04-01",
    });

    await calculatePaidLeavesForEmployee("TEST001", { today: new Date("2026-05-17") });

    const results = await db.select().from(paidLeaves).where(eq(paidLeaves.employeeId, "TEST001"));
    expect(results.length).toBe(1);
    expect(results[0].grantedDays).toBe(0);
    expect(results[0].cycleStartDate).toBe("2026-04-01");
    expect(results[0].cycleEndDate).toBe("2026-09-30");
    expect(results[0].baselineRemaining).toBe(0);
    expect(results[0].currentRemaining).toBe(0);
  });

  test("シナリオ2: 入社1年経過、消化なし", async () => {
    await db.insert(employees).values({
      id: "TEST002",
      name: "テスト2",
      joinDate: "2025-04-01",
    });

    await calculatePaidLeavesForEmployee("TEST002", { today: new Date("2026-05-17") });

    const results = await db
      .select()
      .from(paidLeaves)
      .where(eq(paidLeaves.employeeId, "TEST002"))
      .orderBy(paidLeaves.cycleStartDate);

    expect(results.length).toBe(2);
    // 第0サイクル
    expect(results[0].cycleStartDate).toBe("2025-04-01");
    expect(results[0].grantedDays).toBe(0);
    // 第1サイクル(進行中)
    expect(results[1].cycleStartDate).toBe("2025-10-01");
    expect(results[1].cycleEndDate).toBe("2026-09-30");
    expect(results[1].grantedDays).toBe(10);
    expect(results[1].baselineRemaining).toBe(10);
    expect(results[1].currentRemaining).toBe(10);
    expect(results[1].finalRemaining).toBe(null);
  });

  test("シナリオ3: 入社1年経過、消化3日", async () => {
    await db.insert(employees).values({
      id: "TEST003",
      name: "テスト3",
      joinDate: "2025-04-01",
    });

    await db.insert(leaveUsages).values([
      {
        employeeId: "TEST003",
        startDate: "2025-12-01",
        endDate: "2025-12-01",
        recordDate: "2025-12-01",
        days: 1,
        recordType: "usage",
        isVoided: 0,
      },
      {
        employeeId: "TEST003",
        startDate: "2026-01-15",
        endDate: "2026-01-15",
        recordDate: "2026-01-15",
        days: 2,
        recordType: "usage",
        isVoided: 0,
      },
    ]);

    await calculatePaidLeavesForEmployee("TEST003", { today: new Date("2026-05-17") });

    const results = await db
      .select()
      .from(paidLeaves)
      .where(eq(paidLeaves.employeeId, "TEST003"))
      .orderBy(paidLeaves.cycleStartDate);

    expect(results.length).toBe(2);
    expect(results[1].currentRemaining).toBe(7);
    expect(results[1].finalRemaining).toBe(null);
  });

  test("シナリオ4: 入社3年経過、時効発生(消化少ない)", async () => {
    await db.insert(employees).values({
      id: "TEST004",
      name: "テスト4",
      joinDate: "2023-04-01",
    });

    // 第1サイクル(2023/10/01〜2024/09/30)で 3日消化のみ
    await db.insert(leaveUsages).values([
      {
        employeeId: "TEST004",
        startDate: "2024-05-01",
        endDate: "2024-05-01",
        recordDate: "2024-05-01",
        days: 3,
        recordType: "usage",
        isVoided: 0,
      },
    ]);

    await calculatePaidLeavesForEmployee("TEST004", { today: new Date("2026-05-17") });

    const results = await db
      .select()
      .from(paidLeaves)
      .where(eq(paidLeaves.employeeId, "TEST004"))
      .orderBy(paidLeaves.cycleStartDate);

    // 第0, 第1, 第2, 第3サイクル
    expect(results.length).toBe(4);
    // 第3サイクル(2025/10/01〜2026/09/30、進行中):
    //   時効消滅 = 第1サイクル付与10 - 累積消化3 = 7
    //   第2サイクル final = granted(11) + carry(7) - usage(0) = 18
    //   carry = 18 - 7 = 11
    //   baseline = granted(12) + carry(11) = 23
    expect(results[3].grantedDays).toBe(12);
    expect(results[3].carriedOverDays).toBe(11);
    expect(results[3].baselineRemaining).toBe(23);
  });

  test("シナリオ5: 8月末入社(特別ロジック)", async () => {
    await db.insert(employees).values({
      id: "TEST005",
      name: "テスト5",
      joinDate: "2024-08-31",
    });

    await calculatePaidLeavesForEmployee("TEST005", { today: new Date("2026-05-17") });

    const results = await db
      .select()
      .from(paidLeaves)
      .where(eq(paidLeaves.employeeId, "TEST005"))
      .orderBy(paidLeaves.cycleStartDate);

    expect(results.length).toBe(3);
    expect(results[0].cycleStartDate).toBe("2024-08-31");
    expect(results[0].cycleEndDate).toBe("2025-02-27");
    expect(results[1].cycleStartDate).toBe("2025-02-28");
    expect(results[1].cycleEndDate).toBe("2026-02-27");
    expect(results[2].cycleStartDate).toBe("2026-02-28");
  });

  test("シナリオ7: 冪等性確認", async () => {
    await db.insert(employees).values({
      id: "TEST007",
      name: "テスト7",
      joinDate: "2025-04-01",
    });

    await db.insert(leaveUsages).values({
      employeeId: "TEST007",
      startDate: "2025-12-01",
      endDate: "2025-12-01",
      recordDate: "2025-12-01",
      days: 1,
      recordType: "usage",
      isVoided: 0,
    });

    await calculatePaidLeavesForEmployee("TEST007", { today: new Date("2026-05-17") });
    const first = await db.select().from(paidLeaves).where(eq(paidLeaves.employeeId, "TEST007")).orderBy(paidLeaves.cycleStartDate);

    await calculatePaidLeavesForEmployee("TEST007", { today: new Date("2026-05-17") });
    const second = await db.select().from(paidLeaves).where(eq(paidLeaves.employeeId, "TEST007")).orderBy(paidLeaves.cycleStartDate);

    expect(second.length).toBe(first.length);
    for (let i = 0; i < first.length; i++) {
      expect(second[i].cycleStartDate).toBe(first[i].cycleStartDate);
      expect(second[i].grantedDays).toBe(first[i].grantedDays);
      expect(second[i].baselineRemaining).toBe(first[i].baselineRemaining);
      expect(second[i].currentRemaining).toBe(first[i].currentRemaining);
    }
  });
});

describe("getCurrentRemainingAtDate", () => {
  beforeEach(async () => {
    await db.delete(paidLeaves).where(eq(paidLeaves.employeeId, "TEST_GET01"));
    await db.delete(leaveUsages).where(eq(leaveUsages.employeeId, "TEST_GET01"));
    await db.delete(employees).where(eq(employees.id, "TEST_GET01"));
  });

  test("未来日付の残日数取得(進行中サイクル内)", async () => {
    await db.insert(employees).values({
      id: "TEST_GET01",
      name: "未来テスト",
      joinDate: "2025-04-01",
    });

    await db.insert(leaveUsages).values({
      employeeId: "TEST_GET01",
      startDate: "2025-12-01",
      endDate: "2025-12-01",
      recordDate: "2025-12-01",
      days: 3,
      recordType: "usage",
      isVoided: 0,
    });

    await calculatePaidLeavesForEmployee("TEST_GET01", { today: new Date("2026-05-17") });

    // 未来日付(進行中サイクル内)の残日数
    const remaining = await getCurrentRemainingAtDate("TEST_GET01", new Date("2026-08-01"));
    expect(remaining).toBe(7); // baseline 10 - 消化 3
  });
});
