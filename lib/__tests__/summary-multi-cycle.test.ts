import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import * as schema from "../schema";
import { leaveUsages, paidLeaves, employees } from "../schema";
import {
  calcAutoExpiredDays,
  calcConsumedDaysFromUsages,
  calcRemainingDays,
  calcUsageRate,
} from "../leave-calc";

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
      granted_days REAL NOT NULL DEFAULT 0,
      carried_over_days REAL NOT NULL DEFAULT 0,
      expired_days REAL NOT NULL DEFAULT 0
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
  `);
}

function getLatestLeave(empLeaves: { id: number; grantedDays: number; carriedOverDays: number; expiredDays: number }[]) {
  return empLeaves.reduce((a, b) => (a.id > b.id ? a : b));
}

function computeSummaryForEmployee(
  latestLeave: { grantedDays: number; carriedOverDays: number; id: number },
  cycleUsages: { days: number; isVoided: number; recordType: string }[],
) {
  const grantedDays = latestLeave.grantedDays;
  const carriedOverDays = latestLeave.carriedOverDays;
  const consumed = calcConsumedDaysFromUsages(cycleUsages);
  const allTotal = cycleUsages.reduce((s, u) => s + u.days, 0);
  const usageOnlyTotal = cycleUsages
    .filter(u => u.recordType === "usage")
    .reduce((s, u) => s + u.days, 0);

  const expired = calcAutoExpiredDays(carriedOverDays, allTotal);
  const adjustedRemaining = Math.max(0, grantedDays + carriedOverDays - allTotal - expired);

  const expiredAuto = calcAutoExpiredDays(carriedOverDays, usageOnlyTotal);
  const autoRemaining = Math.max(0, grantedDays + carriedOverDays - usageOnlyTotal - expiredAuto);

  return { grantedDays, carriedOverDays, consumed, adjustedRemaining, autoRemaining, expired };
}

describe("getEmployeeSummaries 相当のロジック（複数サイクル対応）", () => {
  let client: ReturnType<typeof createClient>;
  let testDb: ReturnType<typeof drizzle>;

  beforeAll(async () => {
    const t = createTestDb();
    client = t.client;
    testDb = t.db;
    await initTestDb(client);
  });

  beforeEach(async () => {
    await client.execute("DELETE FROM leave_usages");
    await client.execute("DELETE FROM paid_leaves");
    await client.execute("DELETE FROM employees");
  });

  it("単一サイクル: 通常の残日数計算", async () => {
    await testDb.insert(employees).values({ id: "1", name: "テスト太郎", joinDate: "2024-04-01" });
    const [pl] = await testDb.insert(paidLeaves).values({
      employeeId: "1", grantedDays: 10, carriedOverDays: 5, expiredDays: 0,
    }).returning();

    const now = new Date().toISOString();
    await testDb.insert(leaveUsages).values({
      employeeId: "1", startDate: "2025-01-10", endDate: "2025-01-10",
      paidLeaveId: pl.id, recordDate: "2025-01-10", days: 3, recordType: "usage",
      isVoided: 0, createdAt: now, updatedAt: now,
    });

    const allLeaves = await testDb.select().from(paidLeaves).where(eq(paidLeaves.employeeId, "1"));
    const latest = getLatestLeave(allLeaves);
    const usages = await testDb.select().from(leaveUsages)
      .where(eq(leaveUsages.paidLeaveId, latest.id));
    const activeUsages = usages.filter(u => u.isVoided === 0);

    const result = computeSummaryForEmployee(latest, activeUsages);

    expect(result.grantedDays).toBe(10);
    expect(result.carriedOverDays).toBe(5);
    expect(result.consumed).toBe(3);
    expect(result.expired).toBe(2);
    expect(result.adjustedRemaining).toBe(10);
  });

  it("複数サイクル並存（時効済み含む）: 旧サイクルが合算されない", async () => {
    await testDb.insert(employees).values({ id: "35", name: "阿久津 悠治", joinDate: "2020-10-01" });

    const [oldCycle] = await testDb.insert(paidLeaves).values({
      employeeId: "35", grantedDays: 20, carriedOverDays: 20, expiredDays: 20,
    }).returning();

    const [newCycle] = await testDb.insert(paidLeaves).values({
      employeeId: "35", grantedDays: 20, carriedOverDays: 20, expiredDays: 0,
    }).returning();

    const now = new Date().toISOString();
    await testDb.insert(leaveUsages).values({
      employeeId: "35", startDate: "2026-03-01", endDate: "2026-03-01",
      paidLeaveId: newCycle.id, recordDate: "2026-03-01", days: 1, recordType: "usage",
      isVoided: 0, createdAt: now, updatedAt: now,
    });
    await testDb.insert(leaveUsages).values({
      employeeId: "35", startDate: "2026-04-01", endDate: "2026-04-01",
      paidLeaveId: newCycle.id, recordDate: "2026-04-01", days: 1, recordType: "usage",
      isVoided: 0, createdAt: now, updatedAt: now,
    });

    const allLeaves = await testDb.select().from(paidLeaves).where(eq(paidLeaves.employeeId, "35"));
    expect(allLeaves.length).toBe(2);

    const latest = getLatestLeave(allLeaves);
    expect(latest.id).toBe(newCycle.id);

    const usages = await testDb.select().from(leaveUsages)
      .where(eq(leaveUsages.paidLeaveId, latest.id));
    const activeUsages = usages.filter(u => u.isVoided === 0);

    const result = computeSummaryForEmployee(latest, activeUsages);

    expect(result.grantedDays).toBe(20);
    expect(result.carriedOverDays).toBe(20);
    expect(result.consumed).toBe(2);
    expect(result.adjustedRemaining).toBe(20);
    expect(result.autoRemaining).toBe(20);
  });

  it("複数サイクル: 旧サイクルの全サイクル合算が誤った値を出すことを確認（修正前のロジック再現）", async () => {
    await testDb.insert(employees).values({ id: "35", name: "阿久津 悠治", joinDate: "2020-10-01" });

    await testDb.insert(paidLeaves).values({
      employeeId: "35", grantedDays: 20, carriedOverDays: 20, expiredDays: 20,
    });
    await testDb.insert(paidLeaves).values({
      employeeId: "35", grantedDays: 20, carriedOverDays: 20, expiredDays: 0,
    });

    const allLeaves = await testDb.select().from(paidLeaves).where(eq(paidLeaves.employeeId, "35"));

    const buggyGranted = allLeaves.reduce((s, l) => s + l.grantedDays, 0);
    const buggyCarried = allLeaves.reduce((s, l) => s + l.carriedOverDays, 0);
    expect(buggyGranted).toBe(40);
    expect(buggyCarried).toBe(40);

    const buggyExpired = calcAutoExpiredDays(buggyCarried, 2);
    const buggyRemaining = Math.max(0, buggyGranted + buggyCarried - 2 - buggyExpired);
    expect(buggyRemaining).toBe(40);
  });

  it("補正値あり: 最新サイクルの補正値のみ反映", async () => {
    await testDb.insert(employees).values({ id: "1", name: "テスト太郎", joinDate: "2024-04-01" });
    const [pl] = await testDb.insert(paidLeaves).values({
      employeeId: "1", grantedDays: 20, carriedOverDays: 5, expiredDays: 0,
    }).returning();

    const now = new Date().toISOString();
    await testDb.insert(leaveUsages).values({
      employeeId: "1", startDate: "2025-01-10", endDate: "2025-01-10",
      paidLeaveId: pl.id, recordDate: "2025-01-10", days: 2, recordType: "usage",
      isVoided: 0, createdAt: now, updatedAt: now,
    });
    await testDb.insert(leaveUsages).values({
      employeeId: "1", startDate: "2025-01-15", endDate: "2025-01-15",
      paidLeaveId: pl.id, recordDate: "2025-01-15", days: -3, recordType: "adjustment",
      reason: "権利加算", isVoided: 0, createdAt: now, updatedAt: now,
    });

    const allLeaves = await testDb.select().from(paidLeaves).where(eq(paidLeaves.employeeId, "1"));
    const latest = getLatestLeave(allLeaves);
    const usages = await testDb.select().from(leaveUsages)
      .where(eq(leaveUsages.paidLeaveId, latest.id));
    const activeUsages = usages.filter(u => u.isVoided === 0);

    const result = computeSummaryForEmployee(latest, activeUsages);

    // allTotal = 2 + (-3) = -1, Math.max(0,-1)=0 for expired guard
    // expired = calcAutoExpiredDays(5, -1) = 5 (negative guard: max(0,-1)=0, so min(0,5)=0, 5-0=5)
    // adjustedRemaining = max(0, 20+5-(-1)-5) = max(0, 21) = 21
    expect(result.adjustedRemaining).toBe(21);

    // autoRemaining uses only usage records (days=2)
    // expiredAuto = calcAutoExpiredDays(5, 2) = 3
    // autoRemaining = max(0, 20+5-2-3) = 20
    expect(result.autoRemaining).toBe(20);
  });

  it("getPaidLeaveByEmployee と getEmployeeSummaries が同じ値を返す", async () => {
    await testDb.insert(employees).values({ id: "35", name: "阿久津 悠治", joinDate: "2020-10-01" });

    await testDb.insert(paidLeaves).values({
      employeeId: "35", grantedDays: 20, carriedOverDays: 20, expiredDays: 20,
    });
    const [newCycle] = await testDb.insert(paidLeaves).values({
      employeeId: "35", grantedDays: 20, carriedOverDays: 20, expiredDays: 0,
    }).returning();

    const now = new Date().toISOString();
    await testDb.insert(leaveUsages).values({
      employeeId: "35", startDate: "2026-03-01", endDate: "2026-03-01",
      paidLeaveId: newCycle.id, recordDate: "2026-03-01", days: 1, recordType: "usage",
      isVoided: 0, createdAt: now, updatedAt: now,
    });
    await testDb.insert(leaveUsages).values({
      employeeId: "35", startDate: "2026-04-01", endDate: "2026-04-01",
      paidLeaveId: newCycle.id, recordDate: "2026-04-01", days: 1, recordType: "usage",
      isVoided: 0, createdAt: now, updatedAt: now,
    });

    // getPaidLeaveByEmployee 相当: ORDER BY id DESC LIMIT 1
    const latestRows = await testDb.select().from(paidLeaves)
      .where(eq(paidLeaves.employeeId, "35"))
      .orderBy(schema.paidLeaves.id)
      .limit(10);
    const detailLeave = latestRows.reduce((a, b) => (a.id > b.id ? a : b));

    const detailUsages = (await testDb.select().from(leaveUsages)
      .where(eq(leaveUsages.paidLeaveId, detailLeave.id)))
      .filter(u => u.isVoided === 0);

    const detailAllTotal = detailUsages.reduce((s, u) => s + u.days, 0);
    const detailExpired = calcAutoExpiredDays(detailLeave.carriedOverDays, detailAllTotal);
    const detailAdjustedRemaining = Math.max(0,
      detailLeave.grantedDays + detailLeave.carriedOverDays - detailAllTotal - detailExpired);

    // getEmployeeSummaries 相当: 最新サイクル + paidLeaveId ベース集約
    const allLeaves = await testDb.select().from(paidLeaves).where(eq(paidLeaves.employeeId, "35"));
    const summaryLeave = getLatestLeave(allLeaves);
    const summaryUsages = (await testDb.select().from(leaveUsages)
      .where(eq(leaveUsages.paidLeaveId, summaryLeave.id)))
      .filter(u => u.isVoided === 0);
    const summaryResult = computeSummaryForEmployee(summaryLeave, summaryUsages);

    expect(summaryResult.adjustedRemaining).toBe(detailAdjustedRemaining);
    expect(summaryResult.adjustedRemaining).toBe(20);
    expect(detailAdjustedRemaining).toBe(20);
  });

  it("孤児 usage (paidLeaveId=0) が最新サイクルにリマップされて集計に含まれる", async () => {
    await testDb.insert(employees).values({ id: "10", name: "孤児テスト", joinDate: "2024-04-01" });
    const [pl] = await testDb.insert(paidLeaves).values({
      employeeId: "10", grantedDays: 20, carriedOverDays: 5, expiredDays: 0,
    }).returning();

    const now = new Date().toISOString();
    // paidLeaveId=pl.id の正常 usage
    await testDb.insert(leaveUsages).values({
      employeeId: "10", startDate: "2025-01-10", endDate: "2025-01-10",
      paidLeaveId: pl.id, recordDate: "2025-01-10", days: 1, recordType: "usage",
      isVoided: 0, createdAt: now, updatedAt: now,
    });
    // paidLeaveId=0 の孤児 usage（createLeaveUsage がデフォルト0で作成するケース）
    await testDb.insert(leaveUsages).values({
      employeeId: "10", startDate: "2025-02-15", endDate: "2025-02-15",
      paidLeaveId: 0, recordDate: "2025-02-15", days: 2, recordType: "usage",
      isVoided: 0, createdAt: now, updatedAt: now,
    });

    const allLeaves = await testDb.select().from(paidLeaves).where(eq(paidLeaves.employeeId, "10"));
    const latest = getLatestLeave(allLeaves);

    // 孤児リマップロジック再現: paidLeaveId=0 → latest.id にマッピング
    const allUsages = await testDb.select().from(leaveUsages);
    const usagesByPaidLeaveId = new Map<number, typeof allUsages>();
    const latestByEmp = new Map<string, number>();
    latestByEmp.set("10", latest.id);
    for (const u of allUsages) {
      if (u.isVoided !== 0) continue;
      const key = u.paidLeaveId === 0
        ? (latestByEmp.get(u.employeeId) ?? 0)
        : u.paidLeaveId;
      const arr = usagesByPaidLeaveId.get(key) ?? [];
      arr.push(u);
      usagesByPaidLeaveId.set(key, arr);
    }

    const cycleUsages = usagesByPaidLeaveId.get(latest.id) ?? [];
    expect(cycleUsages.length).toBe(2);

    const result = computeSummaryForEmployee(latest, cycleUsages);

    // consumed = 1 + 2 = 3 (孤児が含まれている)
    expect(result.consumed).toBe(3);
    // expired = calcAutoExpiredDays(5, 3) = 2
    expect(result.expired).toBe(2);
    // adjustedRemaining = max(0, 20+5-3-2) = 20
    expect(result.adjustedRemaining).toBe(20);
  });

  it("paidLeaveId=0 のみの usage しかない社員も正しく集計される", async () => {
    await testDb.insert(employees).values({ id: "20", name: "全孤児テスト", joinDate: "2024-04-01" });
    const [pl] = await testDb.insert(paidLeaves).values({
      employeeId: "20", grantedDays: 15, carriedOverDays: 0, expiredDays: 0,
    }).returning();

    const now = new Date().toISOString();
    await testDb.insert(leaveUsages).values({
      employeeId: "20", startDate: "2025-03-01", endDate: "2025-03-01",
      paidLeaveId: 0, recordDate: "2025-03-01", days: 5, recordType: "usage",
      isVoided: 0, createdAt: now, updatedAt: now,
    });

    const allLeaves = await testDb.select().from(paidLeaves).where(eq(paidLeaves.employeeId, "20"));
    const latest = getLatestLeave(allLeaves);

    const allUsages = await testDb.select().from(leaveUsages)
      .where(eq(leaveUsages.employeeId, "20"));
    const usagesByPaidLeaveId = new Map<number, typeof allUsages>();
    const latestByEmp = new Map<string, number>();
    latestByEmp.set("20", latest.id);
    for (const u of allUsages) {
      if (u.isVoided !== 0) continue;
      const key = u.paidLeaveId === 0
        ? (latestByEmp.get(u.employeeId) ?? 0)
        : u.paidLeaveId;
      const arr = usagesByPaidLeaveId.get(key) ?? [];
      arr.push(u);
      usagesByPaidLeaveId.set(key, arr);
    }

    const cycleUsages = usagesByPaidLeaveId.get(latest.id) ?? [];
    expect(cycleUsages.length).toBe(1);

    const result = computeSummaryForEmployee(latest, cycleUsages);

    // consumed = 5, carryover = 0 → expired = 0
    expect(result.consumed).toBe(5);
    expect(result.expired).toBe(0);
    // adjustedRemaining = 15 - 5 - 0 = 10
    expect(result.adjustedRemaining).toBe(10);
  });
});
