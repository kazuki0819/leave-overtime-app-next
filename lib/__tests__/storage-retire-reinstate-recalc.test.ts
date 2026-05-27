import { describe, test, expect, beforeEach } from "vitest";
import { TursoStorage } from "../storage";
import { calculatePaidLeavesForEmployee } from "../paid-leave-calc";
import { db } from "../db";
import { employees, paidLeaves, leaveUsages } from "../schema";
import { eq, asc } from "drizzle-orm";

const TEST_IDS = ["TEST_RR01", "TEST_RR02"];

describe("retireEmployee / reinstateEmployee → paid_leaves 再計算", () => {
  beforeEach(async () => {
    for (const id of TEST_IDS) {
      await db.delete(paidLeaves).where(eq(paidLeaves.employeeId, id));
      await db.delete(leaveUsages).where(eq(leaveUsages.employeeId, id));
      await db.delete(employees).where(eq(employees.id, id));
    }
  });

  test("retireEmployee 実行後、退職日以降のサイクルが削除される", async () => {
    await db.insert(employees).values({
      id: "TEST_RR01",
      name: "退職処理テスト01",
      assignment: "-",
      joinDate: "2020-04-01",
      retiredDate: "",
      status: "active",
      tenureMonths: 0,
      memo: "",
    });

    await calculatePaidLeavesForEmployee("TEST_RR01", {
      today: new Date("2026-05-28"),
    });

    const before = await db
      .select()
      .from(paidLeaves)
      .where(eq(paidLeaves.employeeId, "TEST_RR01"));
    expect(before.length).toBeGreaterThanOrEqual(6);

    const storageInstance = new TursoStorage();
    await storageInstance.retireEmployee("TEST_RR01", "2022-09-30");

    const after = await db
      .select()
      .from(paidLeaves)
      .where(eq(paidLeaves.employeeId, "TEST_RR01"))
      .orderBy(asc(paidLeaves.cycleStartDate));

    const cycleStarts = after.map((c) => c.cycleStartDate);
    expect(cycleStarts).toContain("2021-10-01");
    expect(cycleStarts).not.toContain("2022-10-01");
    expect(cycleStarts).not.toContain("2025-10-01");
  });

  test("reinstateEmployee 実行後、サイクルが today まで再生成される", async () => {
    await db.insert(employees).values({
      id: "TEST_RR02",
      name: "退職処理テスト02",
      assignment: "-",
      joinDate: "2020-04-01",
      retiredDate: "2022-09-30",
      status: "retired",
      tenureMonths: 0,
      memo: "",
    });

    await calculatePaidLeavesForEmployee("TEST_RR02", {
      today: new Date("2026-05-28"),
    });

    const before = await db
      .select()
      .from(paidLeaves)
      .where(eq(paidLeaves.employeeId, "TEST_RR02"))
      .orderBy(asc(paidLeaves.cycleStartDate));

    const beforeStarts = before.map((c) => c.cycleStartDate);
    expect(beforeStarts).not.toContain("2022-10-01");

    const storageInstance = new TursoStorage();
    await storageInstance.reinstateEmployee("TEST_RR02");

    const after = await db
      .select()
      .from(paidLeaves)
      .where(eq(paidLeaves.employeeId, "TEST_RR02"))
      .orderBy(asc(paidLeaves.cycleStartDate));

    const cycleStarts = after.map((c) => c.cycleStartDate);
    expect(cycleStarts).toContain("2022-10-01");
    expect(cycleStarts).toContain("2025-10-01");
  });
});
