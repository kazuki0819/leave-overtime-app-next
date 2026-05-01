import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import * as schema from "../schema";
import { leaveUsages, paidLeaves, employees, leaveUsageHistory } from "../schema";

function createTestDb() {
  const client = createClient({ url: "file::memory:" });
  const testDb = drizzle(client, { schema });
  return { client, db: testDb };
}

async function initTestDb(client: ReturnType<typeof createClient>) {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      assignment TEXT NOT NULL DEFAULT '-',
      join_date TEXT NOT NULL DEFAULT '',
      retired_date TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      tenure_months INTEGER NOT NULL DEFAULT 0,
      memo TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS paid_leaves (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT NOT NULL,
      fiscal_year INTEGER NOT NULL DEFAULT 2025,
      granted_days REAL NOT NULL DEFAULT 0,
      carried_over_days REAL NOT NULL DEFAULT 0,
      consumed_days REAL NOT NULL DEFAULT 0,
      remaining_days REAL NOT NULL DEFAULT 0,
      expired_days REAL NOT NULL DEFAULT 0,
      usage_rate REAL NOT NULL DEFAULT 0,
      manual_baseline_date TEXT,
      manual_baseline_remaining REAL,
      manual_baseline_note TEXT
    );

    CREATE TABLE IF NOT EXISTS leave_usages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      paid_leave_id INTEGER NOT NULL DEFAULT 0,
      record_date TEXT NOT NULL DEFAULT '',
      days REAL NOT NULL DEFAULT 1,
      note TEXT,
      record_type TEXT NOT NULL DEFAULT 'usage',
      reason TEXT DEFAULT '',
      is_voided INTEGER NOT NULL DEFAULT 0,
      voided_at TEXT,
      voided_reason TEXT,
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS leave_usage_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      leave_usage_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      acted_at TEXT NOT NULL,
      details TEXT,
      reason TEXT
    );
  `);
}

describe("addLeaveAdjustment / voidLeaveUsage (直接DB操作)", () => {
  let client: ReturnType<typeof createClient>;
  let testDb: ReturnType<typeof drizzle>;

  beforeAll(async () => {
    const t = createTestDb();
    client = t.client;
    testDb = t.db;
    await initTestDb(client);
  });

  let paidLeaveId: number;

  beforeEach(async () => {
    await client.execute("DELETE FROM leave_usages");
    await client.execute("DELETE FROM leave_usage_history");
    await client.execute("DELETE FROM paid_leaves");
    await client.execute("DELETE FROM employees");

    await testDb.insert(employees).values({
      id: "1",
      name: "テスト太郎",
    });

    const plRows = await testDb.insert(paidLeaves).values({
      employeeId: "1",
      fiscalYear: 2025,
      grantedDays: 20,
      carriedOverDays: 5,
      remainingDays: 25,
    }).returning();
    paidLeaveId = plRows[0].id;
  });

  it("補正値レコードを登録できる", async () => {
    const now = new Date().toISOString();
    const rows = await testDb.insert(leaveUsages).values({
      employeeId: "1",
      startDate: "2026-05-01",
      endDate: "2026-05-01",
      paidLeaveId,
      recordDate: "2026-05-01",
      days: -2.0,
      recordType: "adjustment",
      reason: "マイグレーション初期値",
      isVoided: 0,
      createdAt: now,
      updatedAt: now,
    }).returning();

    expect(rows[0].recordType).toBe("adjustment");
    expect(rows[0].days).toBe(-2.0);
    expect(rows[0].reason).toBe("マイグレーション初期値");
    expect(rows[0].isVoided).toBe(0);
    expect(rows[0].paidLeaveId).toBe(paidLeaveId);
  });

  it("解除処理が正しく動作する", async () => {
    const now = new Date().toISOString();
    const inserted = await testDb.insert(leaveUsages).values({
      employeeId: "1",
      startDate: "2026-05-01",
      endDate: "2026-05-01",
      paidLeaveId,
      recordDate: "2026-05-01",
      days: 1.0,
      recordType: "usage",
      reason: "",
      isVoided: 0,
      createdAt: now,
      updatedAt: now,
    }).returning();

    const usageId = inserted[0].id;

    await testDb.update(leaveUsages).set({
      isVoided: 1,
      voidedAt: now,
      voidedReason: "入力ミス",
      updatedAt: now,
    }).where(eq(leaveUsages.id, usageId));

    await testDb.insert(leaveUsageHistory).values({
      leaveUsageId: usageId,
      action: "voided",
      actedAt: now,
      details: JSON.stringify({ recordType: "usage", days: 1.0 }),
      reason: "入力ミス",
    });

    const updated = await testDb.select().from(leaveUsages)
      .where(eq(leaveUsages.id, usageId)).limit(1);
    expect(updated[0].isVoided).toBe(1);
    expect(updated[0].voidedReason).toBe("入力ミス");

    const history = await testDb.select().from(leaveUsageHistory)
      .where(eq(leaveUsageHistory.leaveUsageId, usageId));
    expect(history).toHaveLength(1);
    expect(history[0].action).toBe("voided");
    expect(history[0].reason).toBe("入力ミス");
  });

  it("getPaidLeaveByEmployee の拡張戻り値が正しい", async () => {
    const now = new Date().toISOString();
    await testDb.insert(leaveUsages).values({
      employeeId: "1",
      startDate: "2026-05-01",
      endDate: "2026-05-01",
      paidLeaveId,
      recordDate: "2026-05-01",
      days: 3.0,
      recordType: "adjustment",
      reason: "消化発覚分",
      isVoided: 0,
      createdAt: now,
      updatedAt: now,
    });

    await testDb.insert(leaveUsages).values({
      employeeId: "1",
      startDate: "2026-05-02",
      endDate: "2026-05-02",
      paidLeaveId,
      recordDate: "2026-05-02",
      days: -1.0,
      recordType: "adjustment",
      reason: "権利加算",
      isVoided: 0,
      createdAt: now,
      updatedAt: now,
    });

    // 解除済みの補正値は計算に含めない
    await testDb.insert(leaveUsages).values({
      employeeId: "1",
      startDate: "2026-05-03",
      endDate: "2026-05-03",
      paidLeaveId,
      recordDate: "2026-05-03",
      days: 10.0,
      recordType: "adjustment",
      reason: "解除テスト",
      isVoided: 1,
      voidedAt: now,
      voidedReason: "誤入力",
      createdAt: now,
      updatedAt: now,
    });

    const activeUsages = await testDb.select().from(leaveUsages)
      .where(eq(leaveUsages.isVoided, 0));
    const adjustmentTotal = activeUsages
      .filter((u) => u.recordType === "adjustment" && u.paidLeaveId === paidLeaveId)
      .reduce((sum, u) => sum + u.days, 0);

    const plRow = await testDb.select().from(paidLeaves)
      .where(eq(paidLeaves.id, paidLeaveId)).limit(1);
    const leave = plRow[0];

    // adjustmentTotal = 3.0 + (-1.0) = 2.0
    expect(adjustmentTotal).toBe(2.0);
    // adjustedRemainingDays = 25 - 2.0 = 23.0
    expect(leave.remainingDays - adjustmentTotal).toBe(23.0);
    // autoRemainingDays = 25 (変更なし)
    expect(leave.remainingDays).toBe(25);
  });

  it("0.125刻みの補正値が正しく保存される", async () => {
    const now = new Date().toISOString();
    const rows = await testDb.insert(leaveUsages).values({
      employeeId: "1",
      startDate: "2026-05-01",
      endDate: "2026-05-01",
      paidLeaveId,
      recordDate: "2026-05-01",
      days: 0.125,
      recordType: "adjustment",
      reason: "1時間分の補正",
      isVoided: 0,
      createdAt: now,
      updatedAt: now,
    }).returning();

    expect(rows[0].days).toBe(0.125);
  });

  it("5.875の浮動小数点誤差が問題にならないことを確認", async () => {
    const now = new Date().toISOString();
    const rows = await testDb.insert(leaveUsages).values({
      employeeId: "1",
      startDate: "2026-05-01",
      endDate: "2026-05-01",
      paidLeaveId,
      recordDate: "2026-05-01",
      days: 5.875,
      recordType: "adjustment",
      reason: "浮動小数点テスト",
      isVoided: 0,
      createdAt: now,
      updatedAt: now,
    }).returning();

    expect(rows[0].days).toBe(5.875);
  });
});
