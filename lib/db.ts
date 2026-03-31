import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

const url = process.env.TURSO_DATABASE_URL || "file:local.db";
const authToken = process.env.TURSO_AUTH_TOKEN;

export const client = createClient(
  authToken ? { url, authToken } : { url }
);

export const db = drizzle(client, { schema });

// Create tables if they don't exist
export async function initializeDatabase() {
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

    CREATE TABLE IF NOT EXISTS assignment_histories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT NOT NULL,
      assignment TEXT NOT NULL DEFAULT '-',
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT ''
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
      usage_rate REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS leave_usages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      days REAL NOT NULL DEFAULT 1,
      reason TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS special_leaves (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      days REAL NOT NULL DEFAULT 1,
      leave_type TEXT NOT NULL DEFAULT 'その他',
      reason TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS monthly_overtimes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT NOT NULL,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      overtime_hours REAL NOT NULL DEFAULT 0,
      late_night_overtime REAL NOT NULL DEFAULT 0,
      holiday_work_legal REAL NOT NULL DEFAULT 0,
      holiday_work_non_legal REAL NOT NULL DEFAULT 0,
      holiday_work_legal_count INTEGER NOT NULL DEFAULT 0,
      holiday_work_non_legal_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS _meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // 既存テーブルへのカラム追加（既に存在する場合はスキップ）
  try { await client.execute("ALTER TABLE employees ADD COLUMN memo TEXT NOT NULL DEFAULT ''"); } catch {}
  try { await client.execute("ALTER TABLE monthly_overtimes ADD COLUMN holiday_work_legal REAL NOT NULL DEFAULT 0"); } catch {}
  try { await client.execute("ALTER TABLE monthly_overtimes ADD COLUMN holiday_work_non_legal REAL NOT NULL DEFAULT 0"); } catch {}
  try { await client.execute("ALTER TABLE monthly_overtimes ADD COLUMN holiday_work_legal_count INTEGER NOT NULL DEFAULT 0"); } catch {}
  try { await client.execute("ALTER TABLE monthly_overtimes ADD COLUMN holiday_work_non_legal_count INTEGER NOT NULL DEFAULT 0"); } catch {}
}
