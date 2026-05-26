import { describe, test, expect, beforeEach } from "vitest";
import { storage } from "../storage";
import { calculatePaidLeavesForEmployee } from "../paid-leave-calc";
import { db } from "../db";
import { employees, paidLeaves, leaveUsages } from "../schema";
import { eq, asc } from "drizzle-orm";

const TEST_IDS = ["JOINDATE_01", "JOINDATE_02", "JOINDATE_03"];

describe("updateEmployee: 入社日変更時のサイクル自動再生成", () => {
  beforeEach(async () => {
    for (const id of TEST_IDS) {
      await db.delete(paidLeaves).where(eq(paidLeaves.employeeId, id));
      await db.delete(leaveUsages).where(eq(leaveUsages.employeeId, id));
      await db.delete(employees).where(eq(employees.id, id));
    }
  });

  test("入社日変更時に paid_leaves が再生成される", async () => {
    await db.insert(employees).values({
      id: "JOINDATE_01",
      name: "入社日テスト1",
      joinDate: "2020-04-01",
    });

    await calculatePaidLeavesForEmployee("JOINDATE_01", {
      today: new Date("2026-05-26"),
      source: "test",
    });

    const before = await db.select().from(paidLeaves)
      .where(eq(paidLeaves.employeeId, "JOINDATE_01"))
      .orderBy(asc(paidLeaves.cycleStartDate));
    expect(before.length).toBeGreaterThan(0);
    const oldFirstCycleStart = before[0].cycleStartDate;

    await storage.updateEmployee("JOINDATE_01", { joinDate: "2018-04-01" });

    const after = await db.select().from(paidLeaves)
      .where(eq(paidLeaves.employeeId, "JOINDATE_01"))
      .orderBy(asc(paidLeaves.cycleStartDate));

    expect(after.length).toBeGreaterThan(before.length);
    expect(after[0].cycleStartDate).not.toBe(oldFirstCycleStart);
    expect(after[0].cycleStartDate).toBe("2018-04-01");
  });

  test("入社日が変わらない場合は paid_leaves が再生成されない", async () => {
    await db.insert(employees).values({
      id: "JOINDATE_02",
      name: "入社日テスト2",
      joinDate: "2020-04-01",
    });

    await calculatePaidLeavesForEmployee("JOINDATE_02", {
      today: new Date("2026-05-26"),
      source: "test",
    });

    const before = await db.select().from(paidLeaves)
      .where(eq(paidLeaves.employeeId, "JOINDATE_02"))
      .orderBy(asc(paidLeaves.cycleStartDate));
    const idsBefore = before.map((pl) => pl.id);

    await storage.updateEmployee("JOINDATE_02", { name: "名前変更のみ" });

    const after = await db.select().from(paidLeaves)
      .where(eq(paidLeaves.employeeId, "JOINDATE_02"))
      .orderBy(asc(paidLeaves.cycleStartDate));
    const idsAfter = after.map((pl) => pl.id);

    expect(idsAfter).toEqual(idsBefore);
  });

  test("入社日変更後も leave_usages は削除されず新サイクルに振り分けられる", async () => {
    await db.insert(employees).values({
      id: "JOINDATE_03",
      name: "入社日テスト3",
      joinDate: "2020-04-01",
    });

    await calculatePaidLeavesForEmployee("JOINDATE_03", {
      today: new Date("2026-05-26"),
      source: "test",
    });

    await storage.createLeaveUsage({
      employeeId: "JOINDATE_03",
      recordDate: "2021-05-10",
      days: 1,
      note: "テスト消化",
    });

    const usagesBefore = await db.select().from(leaveUsages)
      .where(eq(leaveUsages.employeeId, "JOINDATE_03"));
    expect(usagesBefore.length).toBe(1);

    await storage.updateEmployee("JOINDATE_03", { joinDate: "2019-04-01" });

    const usagesAfter = await db.select().from(leaveUsages)
      .where(eq(leaveUsages.employeeId, "JOINDATE_03"));
    expect(usagesAfter.length).toBe(1);
    expect(usagesAfter[0].recordDate).toBe("2021-05-10");

    const cycles = await db.select().from(paidLeaves)
      .where(eq(paidLeaves.employeeId, "JOINDATE_03"))
      .orderBy(asc(paidLeaves.cycleStartDate));

    const matchingCycle = cycles.find(
      (c) => c.cycleStartDate <= "2021-05-10" && c.cycleEndDate >= "2021-05-10"
    );
    expect(matchingCycle).toBeDefined();
    expect(matchingCycle!.currentRemaining).toBeLessThan(matchingCycle!.baselineRemaining);
  });
});
