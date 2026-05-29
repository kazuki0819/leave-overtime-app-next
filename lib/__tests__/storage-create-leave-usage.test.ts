import { describe, test, expect, beforeEach } from "vitest";
import { storage } from "../storage";
import { db } from "../db";
import { employees, paidLeaves, leaveUsages } from "../schema";
import { eq } from "drizzle-orm";
import { calculatePaidLeavesForEmployee } from "../paid-leave-calc";

const TEST_ID = "CLU_TS_01";

describe("createLeaveUsage timestamps", () => {
  beforeEach(async () => {
    await db.delete(leaveUsages).where(eq(leaveUsages.employeeId, TEST_ID));
    await db.delete(paidLeaves).where(eq(paidLeaves.employeeId, TEST_ID));
    await db.delete(employees).where(eq(employees.id, TEST_ID));

    await db.insert(employees).values({
      id: TEST_ID,
      name: "タイムスタンプテスト",
      joinDate: "2025-04-01",
    });
    await calculatePaidLeavesForEmployee(TEST_ID, { today: new Date("2026-05-30"), source: "test" });
  });

  test("createdAt / updatedAt に ISO 8601 形式の値がセットされる", async () => {
    const before = new Date().toISOString();

    const created = await storage.createLeaveUsage({
      employeeId: TEST_ID,
      recordDate: "2026-01-15",
      days: 1,
    });

    const after = new Date().toISOString();

    expect(created.createdAt).not.toBe("");
    expect(created.updatedAt).not.toBe("");
    expect(created.createdAt).toBe(created.updatedAt);
    expect(created.createdAt >= before).toBe(true);
    expect(created.createdAt <= after).toBe(true);

    const rows = await db.select().from(leaveUsages).where(eq(leaveUsages.id, created.id));
    expect(rows[0].createdAt).toBe(created.createdAt);
    expect(rows[0].updatedAt).toBe(created.updatedAt);
  });
});
