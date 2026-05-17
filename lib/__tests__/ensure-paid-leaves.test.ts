import { describe, test, expect, beforeEach, vi } from "vitest";
import { ensurePaidLeavesUpToDate } from "../paid-leave-calc";
import { db } from "../db";
import { employees, paidLeaves, leaveUsages } from "../schema";
import { eq } from "drizzle-orm";

const TEST_IDS = ["ENSURE_01", "ENSURE_02", "ENSURE_03", "ENSURE_04", "ENSURE_05"];

describe("ensurePaidLeavesUpToDate", () => {
  beforeEach(async () => {
    for (const id of TEST_IDS) {
      await db.delete(paidLeaves).where(eq(paidLeaves.employeeId, id));
      await db.delete(leaveUsages).where(eq(leaveUsages.employeeId, id));
      await db.delete(employees).where(eq(employees.id, id));
    }
  });

  test("paid_leaves が空の社員に対して呼ぶと、サイクルが生成される", async () => {
    await db.insert(employees).values({
      id: "ENSURE_01",
      name: "テスト ensure 01",
      joinDate: "2025-04-01",
    });

    const beforeRows = await db.select().from(paidLeaves).where(eq(paidLeaves.employeeId, "ENSURE_01"));
    expect(beforeRows.length).toBe(0);

    await ensurePaidLeavesUpToDate("ENSURE_01", new Date("2026-05-17"));

    const afterRows = await db.select().from(paidLeaves).where(eq(paidLeaves.employeeId, "ENSURE_01"));
    expect(afterRows.length).toBeGreaterThan(0);
  });

  test("最新の cycle_end_date が targetDate 以降の場合、何もしない", async () => {
    await db.insert(employees).values({
      id: "ENSURE_02",
      name: "テスト ensure 02",
      joinDate: "2025-04-01",
    });

    await ensurePaidLeavesUpToDate("ENSURE_02", new Date("2026-05-17"));
    const firstRows = await db.select().from(paidLeaves).where(eq(paidLeaves.employeeId, "ENSURE_02"));
    const firstCount = firstRows.length;
    const firstUpdatedAt = firstRows.map(r => r.updatedAt);

    await ensurePaidLeavesUpToDate("ENSURE_02", new Date("2026-05-17"));
    const secondRows = await db.select().from(paidLeaves).where(eq(paidLeaves.employeeId, "ENSURE_02"));

    expect(secondRows.length).toBe(firstCount);
    expect(secondRows.map(r => r.updatedAt)).toEqual(firstUpdatedAt);
  });

  test("最新の cycle_end_date が targetDate より前の場合、再生成される", async () => {
    await db.insert(employees).values({
      id: "ENSURE_03",
      name: "テスト ensure 03",
      joinDate: "2025-04-01",
    });

    await ensurePaidLeavesUpToDate("ENSURE_03", new Date("2025-08-01"));
    const firstRows = await db.select().from(paidLeaves).where(eq(paidLeaves.employeeId, "ENSURE_03"));
    expect(firstRows.length).toBe(1);

    await ensurePaidLeavesUpToDate("ENSURE_03", new Date("2026-05-17"));
    const secondRows = await db.select().from(paidLeaves).where(eq(paidLeaves.employeeId, "ENSURE_03"));
    expect(secondRows.length).toBe(2);
  });

  test("joinDate が空文字列の社員に対して呼ぶと、警告ログを出してスキップ", async () => {
    await db.insert(employees).values({
      id: "ENSURE_04",
      name: "テスト ensure 04",
      joinDate: "",
    });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await ensurePaidLeavesUpToDate("ENSURE_04", new Date("2026-05-17"));

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("joinDate が未設定のためスキップ")
    );

    const rows = await db.select().from(paidLeaves).where(eq(paidLeaves.employeeId, "ENSURE_04"));
    expect(rows.length).toBe(0);

    warnSpy.mockRestore();
  });

  test("joinDate が null の社員に対して呼ぶと、警告ログを出してスキップ", async () => {
    await db.insert(employees).values({
      id: "ENSURE_05",
      name: "テスト ensure 05",
    });

    const row = await db.select().from(employees).where(eq(employees.id, "ENSURE_05"));
    expect(row[0].joinDate).toBe("");

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await ensurePaidLeavesUpToDate("ENSURE_05", new Date("2026-05-17"));

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("joinDate が未設定のためスキップ")
    );

    const rows = await db.select().from(paidLeaves).where(eq(paidLeaves.employeeId, "ENSURE_05"));
    expect(rows.length).toBe(0);

    warnSpy.mockRestore();
  });
});
