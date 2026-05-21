import { describe, test, expect, beforeEach } from "vitest";
import { storage } from "../storage";
import { calculatePaidLeavesForEmployee } from "../paid-leave-calc";
import { db } from "../db";
import { employees, paidLeaves, leaveUsages, leaveUsageHistory } from "../schema";
import { eq, asc } from "drizzle-orm";

const TEST_IDS = ["RECALC_01", "RECALC_02", "RECALC_03", "RECALC_04"];

describe("storage leave_usages → paid_leaves 自動再計算", () => {
  beforeEach(async () => {
    for (const id of TEST_IDS) {
      await db.delete(paidLeaves).where(eq(paidLeaves.employeeId, id));
      await db.delete(leaveUsages).where(eq(leaveUsages.employeeId, id));
      await db.delete(employees).where(eq(employees.id, id));
    }
  });

  test("createLeaveUsage 後に paid_leaves が再計算される", async () => {
    await db.insert(employees).values({
      id: "RECALC_01",
      name: "再計算テスト1",
      joinDate: "2025-04-01",
    });

    await calculatePaidLeavesForEmployee("RECALC_01", { today: new Date("2026-05-17"), source: "test" });

    const before = await db.select().from(paidLeaves)
      .where(eq(paidLeaves.employeeId, "RECALC_01"));
    const idsBefore = before.map((pl) => pl.id).sort();

    await storage.createLeaveUsage({
      employeeId: "RECALC_01",
      recordDate: "2026-01-10",
      days: 1,
      note: "テスト消化",
    });

    const after = await db.select().from(paidLeaves)
      .where(eq(paidLeaves.employeeId, "RECALC_01"));
    const idsAfter = after.map((pl) => pl.id).sort();

    expect(after.length).toBe(before.length);
    expect(idsAfter).not.toEqual(idsBefore);
  });

  test("deleteLeaveUsage 後に paid_leaves が再計算される", async () => {
    await db.insert(employees).values({
      id: "RECALC_02",
      name: "再計算テスト2",
      joinDate: "2025-04-01",
    });

    const now = new Date().toISOString();
    const usageRows = await db.insert(leaveUsages).values({
      employeeId: "RECALC_02",
      startDate: "2026-02-01",
      endDate: "2026-02-01",
      recordDate: "2026-02-01",
      days: 2,
      recordType: "usage",
      isVoided: 0,
      createdAt: now,
      updatedAt: now,
    }).returning();
    const usageId = usageRows[0].id;

    await calculatePaidLeavesForEmployee("RECALC_02", { today: new Date("2026-05-17"), source: "test" });

    const before = await db.select().from(paidLeaves)
      .where(eq(paidLeaves.employeeId, "RECALC_02"))
      .orderBy(asc(paidLeaves.cycleStartDate));
    const activeBefore = before.find((pl) => pl.finalRemaining === null);
    expect(activeBefore).toBeDefined();
    expect(activeBefore!.currentRemaining).toBe(8);

    await storage.deleteLeaveUsage(usageId);

    const after = await db.select().from(paidLeaves)
      .where(eq(paidLeaves.employeeId, "RECALC_02"))
      .orderBy(asc(paidLeaves.cycleStartDate));
    const activeAfter = after.find((pl) => pl.finalRemaining === null);
    expect(activeAfter).toBeDefined();
    expect(activeAfter!.currentRemaining).toBe(10);
  });

  test("voidLeaveUsage 後に paid_leaves が再計算される", async () => {
    await db.insert(employees).values({
      id: "RECALC_03",
      name: "再計算テスト3",
      joinDate: "2025-04-01",
    });

    const now = new Date().toISOString();
    const usageRows = await db.insert(leaveUsages).values({
      employeeId: "RECALC_03",
      startDate: "2026-03-01",
      endDate: "2026-03-01",
      recordDate: "2026-03-01",
      days: 3,
      recordType: "usage",
      isVoided: 0,
      createdAt: now,
      updatedAt: now,
    }).returning();
    const usageId = usageRows[0].id;

    await calculatePaidLeavesForEmployee("RECALC_03", { today: new Date("2026-05-17"), source: "test" });

    const before = await db.select().from(paidLeaves)
      .where(eq(paidLeaves.employeeId, "RECALC_03"))
      .orderBy(asc(paidLeaves.cycleStartDate));
    const activeBefore = before.find((pl) => pl.finalRemaining === null);
    expect(activeBefore).toBeDefined();
    expect(activeBefore!.currentRemaining).toBe(7);

    await storage.voidLeaveUsage({
      leaveUsageId: usageId,
      voidedReason: "テスト解除",
    });

    const after = await db.select().from(paidLeaves)
      .where(eq(paidLeaves.employeeId, "RECALC_03"))
      .orderBy(asc(paidLeaves.cycleStartDate));
    const activeAfter = after.find((pl) => pl.finalRemaining === null);
    expect(activeAfter).toBeDefined();
    expect(activeAfter!.currentRemaining).toBe(10);
  });

  test("createLeaveUsage が recordDate を正しくセットし、current_remaining が減る", async () => {
    await db.insert(employees).values({
      id: "RECALC_04",
      name: "recordDateテスト",
      joinDate: "2025-04-01",
    });

    await calculatePaidLeavesForEmployee("RECALC_04", { today: new Date("2026-05-17"), source: "test" });

    const before = await db.select().from(paidLeaves)
      .where(eq(paidLeaves.employeeId, "RECALC_04"))
      .orderBy(asc(paidLeaves.cycleStartDate));
    const activeBefore = before.find((pl) => pl.finalRemaining === null);
    expect(activeBefore).toBeDefined();
    const remainingBefore = activeBefore!.currentRemaining;

    const created = await storage.createLeaveUsage({
      employeeId: "RECALC_04",
      recordDate: "2026-04-10",
      days: 2,
      note: "recordDate配線テスト",
    });

    expect(created.recordDate).toBe("2026-04-10");
    expect(created.startDate).toBe("2026-04-10");
    expect(created.endDate).toBe("2026-04-10");
    expect(created.days).toBe(2);
    expect(created.note).toBe("recordDate配線テスト");

    const after = await db.select().from(paidLeaves)
      .where(eq(paidLeaves.employeeId, "RECALC_04"))
      .orderBy(asc(paidLeaves.cycleStartDate));
    const activeAfter = after.find((pl) => pl.finalRemaining === null);
    expect(activeAfter).toBeDefined();
    expect(activeAfter!.currentRemaining).toBe(remainingBefore - 2);
  });
});
